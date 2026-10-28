"""082: deterministic anatomical rig and baked in-place cloth-toy gaits.

Run Blender -b --python scripts/rig-spirit-pet-quadruped.py [-- --no-render].
Only the original static mesh is imported. Never imports Tripo's incorrect skin.
Coordinates below are measured in the source's normalized, +45deg aligned frame.
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/spirit-pet/heritage-082'
PREVIEW = OUT / 'preview'
PREVIEW.mkdir(parents=True, exist_ok=True)
TAU = math.tau

def smooth(a, b, x):
    t = max(0., min(1., (x-a)/(b-a)))
    return t*t*(3-2*t)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'public/models/heritage/heritage-082.glb'))
mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
verts = [v.co.copy() for v in mesh.data.vertices]
lo = Vector([min(v[i] for v in verts) for i in range(3)])
hi = Vector([max(v[i] for v in verts) for i in range(3)])
original_span = max(hi-lo)
origin = Vector(((lo.x+hi.x)/2, (lo.y+hi.y)/2, lo.z))
align = Matrix.Rotation(math.pi/4, 3, 'Z')
for v in mesh.data.vertices:
    v.co = align @ ((v.co-origin)/original_span)
span = max(v.co.x for v in mesh.data.vertices)-min(v.co.x for v in mesh.data.vertices)
for v in mesh.data.vertices:
    v.co /= span
mesh.name = 'ShandongTiger_082_Quad'

# The source head is turned ~38deg to its left (ear axis and head mirror plane both
# measure 37-39deg). Untwist it about the neck so the face leads walk/run; the page
# turns the head toward the visitor at runtime instead.
HEAD_YAW = math.radians(38)
NECK_X, NECK_Y = .27, 0.
# The head/body seam slopes: nape at z~.45 (x=.2), chin bottom at z~.27 (x=.47).
# Ramp just below that slope so mouth, chin and whiskers turn rigidly with the face;
# the horizontal radius around the head centroid keeps the flank coin motifs untouched.
HEAD_X, HEAD_Y = .39, .10
for vert in mesh.data.vertices:
    p = vert.co*span
    seam = .45-.65*(p.x-.2)
    w = smooth(seam-.08,seam,p.z)*smooth(.10,.22,p.x)
    # Above the neck everything turns, so whiskers far from the centroid stay straight.
    w *= 1-smooth(.28,.36,math.hypot(p.x-HEAD_X,p.y-HEAD_Y))*(1-smooth(.38,.44,p.z))
    if w <= 0:
        continue
    a = -HEAD_YAW*w
    dx, dy = p.x-NECK_X, p.y-NECK_Y
    p.x = NECK_X + dx*math.cos(a) - dy*math.sin(a)
    p.y = NECK_Y + dx*math.sin(a) + dy*math.cos(a)
    vert.co = p/span

def V(p):
    return Vector(p)/span

arm = bpy.data.armatures.new('TigerQuadruped')
rig = bpy.data.objects.new('TigerQuadruped', arm)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
mesh.select_set(False)
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
spec = {}

def bone(name, head, tail, parent=None):
    b = arm.edit_bones.new(name)
    b.head, b.tail = V(head), V(tail)
    b.use_deform = True
    if parent:
        b.parent = arm.edit_bones[parent]
    spec[name] = {'head': list(b.head), 'tail': list(b.tail), 'parent': parent}
    return b

bone('root', (0,0,0), (0,0,.1))
bone('pelvis', (-.32,0,.31), (-.18,0,.32), 'root')
bone('spine', (-.18,0,.32), (.02,0,.32), 'pelvis')
bone('chest', (.02,0,.32), (.18,0,.34), 'spine')
bone('neck', (.18,0,.34), (.27,0,.44), 'chest')
bone('head', (.27,0,.44), (.43,0,.46), 'neck')
bone('tail_01', (-.44,0,.38), (-.54,0,.52), 'pelvis')
bone('tail_02', (-.54,0,.52), (-.55,0,.66), 'tail_01')
bone('tail_03', (-.55,0,.66), (-.46,0,.78), 'tail_02')
# Each paw follows its measured asymmetrical source placement. L is +Y in Blender.
LEGS = {
    'fore.L': ((.16,.20,.31), (.19,.225,.18), (.285,.244,.075), (.36,.244,.035), 'chest', 0.),
    'fore.R': ((.25,-.16,.31), (.31,-.16,.18), (.43,-.145,.075), (.50,-.145,.035), 'chest', .5),
    'hind.L': ((-.35,.18,.30), (-.45,.20,.18), (-.40,.201,.077), (-.32,.201,.037), 'pelvis', .5),
    'hind.R': ((-.35,-.18,.30), (-.45,-.20,.18), (-.40,-.197,.077), (-.32,-.197,.037), 'pelvis', 0.),
}
for key, (hip,knee,ankle,toe,parent,phase) in LEGS.items():
    bone(key+'.upper', hip, knee, parent)
    bone(key+'.lower', knee, ankle, key+'.upper')
    bone(key+'.paw', ankle, toe, key+'.lower')
bpy.ops.object.mode_set(mode='OBJECT')
mesh.parent = rig
mod = mesh.modifiers.new('Quadruped skin', 'ARMATURE')
mod.object = rig
groups = {n: mesh.vertex_groups.new(name=n) for n in spec}

# Explicit masks isolate tail, head, torso and each limb; no nearest-bone leakage.
regions, raw, relax = {}, {}, {}
for vert in mesh.data.vertices:
    x,y,z = p = vert.co*span
    w = {}
    tail_mask = smooth(.32,.43,z) * (1-smooth(-.38,-.28,x))
    head_mask = smooth(.245,.34,z) * smooth(.12,.24,x)
    front = x > .055
    pair = 'fore.' if front else 'hind.'
    # The fore paws sit asymmetrically (L y=.24, R y=-.15): split each pair at its own
    # midline, never at y=0, or belly skin between the legs tears apart mid-stride.
    mid = (LEGS[pair+'L'][2][1]+LEGS[pair+'R'][2][1])/2
    side = 'L' if y > mid else 'R'
    key = pair+side
    hip_, knee_, ankle_ = LEGS[key][:3]
    u = max(0.,min(1.,(z-ankle_[2])/(hip_[2]-ankle_[2])))
    leg_x = ankle_[0]+(knee_[0]-ankle_[0])*min(1.,u*2.2)
    leg_y = ankle_[1]+(hip_[1]-ankle_[1])*u
    # Distance from the leg axis toward the body midline: limb influence fades at the
    # medial surface so belly vertices between the legs stay on the torso.
    medial = leg_y-y if side == 'L' else y-leg_y
    # Higher up the leg merges into chest/breast: narrow the medial reach there, or
    # the swinging thigh drags the breast front into a fold under the chin.
    hz = smooth(.17,.30,z) if front else 0
    lateral = 1-smooth(.07-.04*hz,.14-.06*hz,medial)
    # Paws extend medially beyond the leg shafts: pin the whole low paw region.
    # Omitting this overrides leaves toe/belly transition vertices on the torso.
    low_paw = (1-smooth(.095,.155,z)) * (smooth(.12,.19,x) if front else 1-smooth(-.28,-.19,x))
    low_paw *= 1-smooth(.10,.15,medial)
    lateral = max(lateral,low_paw)
    # The stub legs run up the flank as bulges: weight the whole bulge up to the hip,
    # otherwise only the paw tip swings while the leg itself stays glued to the body.
    limb_top = .37 if front else .36
    limb_mask = (1-smooth(.17,limb_top,z))*lateral
    # A long fade behind the shoulder spreads the swing over more skin (no crease).
    limb_mask *= smooth(.06,.24,x) if front else 1-smooth(-.24,-.12,x)
    limb_mask *= (1-tail_mask)*(1-head_mask)
    if limb_mask > 0:
        paw = 1-smooth(.065,.115,z)
        upper = smooth(.15,.24,z)
        # Flank skin far ahead of / behind the shin follows the thigh, not the shin;
        # otherwise the knee bend of the gallop swings it through the floor. The paw
        # itself (toes reach well ahead of the shin) is excluded.
        upper = max(upper, smooth(.03,.13,abs(x-leg_x))*smooth(.09,.14,z))
        w[key+'.paw'] = limb_mask*paw
        w[key+'.upper'] = limb_mask*(1-paw)*upper
        w[key+'.lower'] = limb_mask*(1-paw)*(1-upper)
    remaining = 1-limb_mask
    if tail_mask > .001:
        t = max(0,min(2,(z-.43)/.15))
        a = min(1,int(t)); f=t-a
        w['tail_0'+str(a+1)] = remaining*tail_mask*(1-f)
        w['tail_0'+str(a+2)] = remaining*tail_mask*f
    if head_mask > .001:
        w['head'] = remaining*(1-tail_mask)*head_mask
    torso = remaining*(1-tail_mask)*(1-head_mask)
    if x < -.18:
        f = smooth(-.36,-.18,x)
        w['pelvis'],w['spine'] = torso*(1-f),torso*f
    else:
        f = smooth(-.18,.10,x)
        w['spine'],w['chest'] = torso*(1-f),torso*f
    raw[vert.index] = w
    relax[vert.index] = smooth(.08,.14,z)*(1-smooth(.36,.42,z))*(1-head_mask)*(1-tail_mask)
    regions[vert.index] = key if limb_mask>.8 else ('head' if head_mask>.9 else 'tail' if tail_mask>.9 else 'body')

# Analytic masks still change fast where leg bulge meets chest and flank, and LBS
# folds the skin there mid-swing. Relax the weights over the surface in that band.
# UV seams split the mesh into islands: weld by position first, or duplicates on
# either side of a seam drift apart and the seam opens.
weld, welded = {}, {}
for vert in mesh.data.vertices:
    welded[vert.index] = weld.setdefault(tuple(round(c,5) for c in vert.co), len(weld))
nbrs = [set() for _ in weld]
for e in mesh.data.edges:
    a,b = welded[e.vertices[0]],welded[e.vertices[1]]
    if a != b: nbrs[a].add(b); nbrs[b].add(a)
field, gain = [{} for _ in weld], [0.]*len(weld)
for i,w in raw.items():
    field[welded[i]] = w; gain[welded[i]] = relax[i]
for _ in range(10):
    nxt = []
    for k,w in enumerate(field):
        if gain[k] <= 0 or not nbrs[k]: nxt.append(w); continue
        avg = {}
        for j in nbrs[k]:
            for n,v in field[j].items(): avg[n] = avg.get(n,0)+v/len(nbrs[k])
        s = .5*gain[k]
        nxt.append({n: (1-s)*w.get(n,0)+s*avg.get(n,0) for n in set(w)|set(avg)})
    field = nxt
for i in raw:
    # Four influences are explicit, renormalized; no exporter truncation surprises.
    w = dict(sorted(((n,v) for n,v in field[welded[i]].items() if v>1e-5),key=lambda kv:-kv[1])[:4])
    total = sum(w.values())
    for n,v in w.items():
        groups[n].add([i],v/total,'REPLACE')

rig.show_in_front = True
rig.data.display_type = 'OCTAHEDRAL'
rest = {b.name:b.matrix_local.copy() for b in arm.bones}
leg_data = {}
for key,(h,k,a,t,parent,phase) in LEGS.items():
    h,k,a,t = map(V,(h,k,a,t))
    leg_data[key] = (h,k,a,t,parent,phase,(k-h).length,(a-k).length)

def point_bone(name, start, end):
    # Transport the rest orientation so roll remains unchanged at zero motion.
    b = rig.pose.bones[name]
    q = (rest[name].to_3x3() @ Vector((0,1,0))).rotation_difference((end-start).normalized())
    b.matrix = Matrix.Translation(start) @ q.to_matrix().to_4x4() @ rest[name].to_quaternion().to_matrix().to_4x4()
    bpy.context.view_layer.update()

contact = {}
actions = {}
# Walk is a diagonal trot (LEGS phases); run is a rotary gallop: fore pair, then hind pair.
RUN_PHASE = {'fore.L': 0., 'fore.R': .1, 'hind.L': .5, 'hind.R': .6}
# The fore legs are nearly straight at rest: centre their stride slightly behind the rest
# paw so the forward reach does not overextend the shoulder.
REACH_BIAS = {'fore.L': -.045, 'fore.R': -.045, 'hind.L': 0., 'hind.R': 0.}
GLIDE = {'fore': .4, 'hind': .25}
for clip,frames,duty,stride,lift in [('walk',30,.62,.16,.05),('run',18,.43,.24,.085),('idle',60,1.,0.,0.)]:
    rig.animation_data_create()
    action = bpy.data.actions.new(clip)
    action.use_fake_user = True
    rig.animation_data.action = action
    actions[clip] = action
    measurements=[]
    for frame in range(frames+1):
        t = frame/frames
        for b in rig.pose.bones:
            b.matrix_basis = Matrix.Identity(4)
            b.rotation_mode = 'QUATERNION'
        bob = (1-math.cos(TAU*2*t))*(.003 if clip=='walk' else 0)
        if clip == 'run':
            # One gallop stroke per cycle: body rises in the gathered flight, back flexes.
            bob = .012*(1-math.cos(TAU*t))
        rig.pose.bones['pelvis'].location.z = bob/span
        flex = .07 if clip=='run' else .012
        rig.pose.bones['chest'].rotation_quaternion = Vector((1,0,0)).rotation_difference(Vector((1,0,flex*math.sin(TAU*t))))
        if clip == 'run':
            rig.pose.bones['pelvis'].rotation_quaternion = Vector((1,0,0)).rotation_difference(Vector((1,0,-.05*math.sin(TAU*t))))
        if clip == 'idle':
            rig.pose.bones['chest'].scale = (1+ .006*math.sin(TAU*t),1,1+.008*math.sin(TAU*t))
        rig.pose.bones['head'].rotation_quaternion = Vector((1,0,0)).rotation_difference(Vector((1,.022*math.sin(TAU*t),.012*math.sin(TAU*t))))
        for i in range(1,4):
            from mathutils import Quaternion
            rig.pose.bones[f'tail_0{i}'].rotation_quaternion = Quaternion((0,1,0),.025*math.sin(TAU*t-(i-1)*.45))
        bpy.context.view_layer.update()
        for key,(h,k,a,toe,parent,phase,l1,l2) in leg_data.items():
            if clip == 'run':
                phase = RUN_PHASE[key]
            p = (t+phase)%1 if clip!='idle' else 0
            stance = p<duty
            bias = REACH_BIAS[key] if clip!='idle' else 0
            if stance:
                dx = bias+stride*(.5-p/duty)
                dz = 0
            else:
                u = (p-duty)/(1-duty)
                dx = bias+stride*(-.5+smooth(0,1,u))
                dz = lift*math.sin(math.pi*u)**2
            target = a+V((dx,0,dz))
            # Anatomical, planar two-bone IK with fixed lateral paw position.
            parent_delta = rig.pose.bones[parent].matrix @ rest[parent].inverted()
            hip = parent_delta @ h
            # The shoulder blade / pelvis glides with the stride, so the thigh swings
            # through a smaller angle; pure rotation about a fixed hip folds the flank
            # skin into a crease where the leg bulge meets the chest.
            hip += parent_delta.to_3x3() @ V((GLIDE[key[:4]]*dx,0,0))
            # Preserve source knee side instead of flipping at a straight limb.
            direction = (target-hip).normalized()
            d = (target-hip).length
            if d >= l1+l2-.0002:
                # Shift hip locally only when needed; foot stays on its intended path.
                hip += direction*(d-(l1+l2-.0002))
                d=(target-hip).length
            along = (l1*l1-l2*l2+d*d)/(2*d)
            # A fixed anatomical pole avoids knee flips when a moving target
            # crosses the rest upper-bone direction between baked frames.
            pole_axis=Vector((-1,0,0))
            pole = pole_axis-direction*pole_axis.dot(direction)
            pole.normalize()
            knee=hip+direction*along+pole*math.sqrt(max(0,l1*l1-along*along))
            point_bone(key+'.upper',hip,knee)
            point_bone(key+'.lower',knee,target)
            rig.pose.bones[key+'.paw'].matrix = Matrix.Translation(target) @ rest[key+'.paw'].to_quaternion().to_matrix().to_4x4()
            bpy.context.view_layer.update()
            actual = rig.pose.bones[key+'.paw'].head.copy()
            measurements.append({'frame':frame+1,'leg':key,'stance':stance,'phase':p,'error':(actual-target).length,'lift':dz/span,'paw':list(actual)})
        for b in rig.pose.bones:
            b.keyframe_insert('location',frame=frame+1,group=b.name)
            b.keyframe_insert('rotation_quaternion',frame=frame+1,group=b.name)
            b.keyframe_insert('scale',frame=frame+1,group=b.name)
    # Linear baked samples; exact periodic endpoint prevents loop pops.
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for kp in fc.keyframe_points:
                        kp.interpolation='LINEAR'
    contact[clip]=measurements
    rig.animation_data.action = None
    track = rig.animation_data.nla_tracks.new()
    track.name = clip
    strip = track.strips.new(clip,1,action)
    strip.action_frame_start=1
    strip.action_frame_end=frames+1
    track.mute=True

scene=bpy.context.scene
scene.render.fps=30
scene.frame_start=1
scene.frame_end=61
rig.animation_data.action=None
for b in rig.pose.bones:
    b.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
mesh.select_set(True)
# Export NLA clips from named tracks, and no studio objects or control rig.
for track in rig.animation_data.nla_tracks:
    track.mute=False
raw=OUT/'quadruped.raw.glb'
bpy.ops.export_scene.gltf(filepath=str(raw), export_format='GLB', use_selection=True,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_nla_strips=True,
    export_force_sampling=True, export_frame_range=False, export_skins=True,
    export_def_bones=True, export_yup=True, export_image_format='AUTO',
    export_optimize_animation_size=True)
for track in rig.animation_data.nla_tracks:
    track.mute=True
rig.animation_data.action=actions['idle']
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'shandong-tiger-quad.blend'))
(OUT/'quad-rig-data.json').write_text(json.dumps({'bones':spec,'contact':contact,'source_alignment_degrees':45,'span':span,'vertices':len(mesh.data.vertices),'triangles':sum(len(p.vertices)-2 for p in mesh.data.polygons),'weight_regions':{r:list(regions.values()).count(r) for r in set(regions.values())}},indent=2))

if '--no-render' in sys.argv:
    sys.exit(0)

# Studio and real renders are retained in an additional review blend.
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=960
scene.render.resolution_y=820
scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Warm studio')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.22,.24,.28,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
scene.view_settings.view_transform='AgX'
for loc,power,size in [((1,-2,3),180,3),((-2,1,2),130,3),((0,2,3),100,2)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    bpy.context.object.data.energy=power
    bpy.context.object.data.shape='DISK'
    bpy.context.object.data.size=size
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.003))
floor=bpy.context.object
mat=bpy.data.materials.new('Warm gray ground')
mat.diffuse_color=(.28,.30,.34,1)
floor.data.materials.append(mat)
bpy.ops.object.camera_add(location=(1.5,-2.5,1.15))
camera=bpy.context.object
camera.data.type='ORTHO'
camera.data.ortho_scale=1.35
scene.camera=camera

def render(name, pos=None):
    if pos is not None:
        camera.location=pos
    camera.rotation_euler=(Vector((0,0,.32))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(PREVIEW/(name+'.png'))
    bpy.ops.render.render(write_still=True)

rig.animation_data.action=None
for b in rig.pose.bones:
    b.matrix_basis=Matrix.Identity(4)
bpy.context.view_layer.update()
render('quad-rest-side',(0,-3,.5))
render('quad-rest-front',(3,0,.48))
render('quad-rest-three-quarter',(1.5,-2.5,1.15))
# Renderable cyan bone rods, overlaid by drawing bones toward the review camera.
overlay=[]
for b in arm.bones:
    for p in [b.head_local,b.tail_local]:
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.009,location=p+Vector((0,-.30,0)))
        o=bpy.context.object
        overlay.append(o)
    a=b.head_local+Vector((0,-.30,0)); z=b.tail_local+Vector((0,-.30,0))
    bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=.0035,depth=(z-a).length,location=(a+z)/2)
    o=bpy.context.object
    o.rotation_euler=(z-a).to_track_quat('Z','Y').to_euler()
    overlay.append(o)
cyan=bpy.data.materials.new('Rig cyan')
cyan.diffuse_color=(.02,.85,1,1)
cyan.use_nodes=True
shader=cyan.node_tree.nodes.get('Principled BSDF')
shader.inputs['Base Color'].default_value=(.02,.85,1,1)
shader.inputs['Emission Color'].default_value=(.02,.85,1,1)
shader.inputs['Emission Strength'].default_value=.7
for o in overlay:
    o.data.materials.append(cyan)
render('quad-skeleton-side',(0,-3,.48))
for o in overlay:
    o.hide_render=True
for clip,frames in [('walk',[1,9,16,24]),('run',[3,12]),('idle',[1,16])]:
    rig.animation_data.action=actions[clip]
    for f in frames:
        scene.frame_set(f)
        render(f'{clip}-{f:02}',(1.5,-2.5,1.0))
rig.animation_data.action=actions['walk']
scene.frame_end=30
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'quadruped-review.blend'))
print('QUADRUPED_COMPLETE',raw)
