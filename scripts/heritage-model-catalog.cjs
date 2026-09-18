// Commissioning brief, not a list of finished assets. Publish only validated GLBs.
const groups = [
  ['陶瓷', 'ceramics', [
    ['景德镇青花梅瓶', 'Jingdezhen blue and white porcelain meiping vase, small flared mouth, short neck, broad shoulders, tapering body, cobalt lotus scrolls under transparent glaze'],
    ['景德镇青花盖罐', 'Jingdezhen blue and white porcelain covered jar, round belly, domed lid, cobalt peony scrolls, white glossy glaze'],
    ['龙泉青瓷莲瓣碗', 'Longquan celadon bowl, translucent jade green glaze, carved lotus petals on exterior, round foot ring'],
    ['龙泉青瓷贯耳瓶', 'Longquan celadon vase with two tubular handles, archaic rectangular neck, rounded pear body, jade green glaze'],
    ['德化白瓷观音', 'Dehua blanc de chine Guanyin porcelain standing figure, ivory white glaze, serene face, flowing robe, folded hands, simple lotus foot'],
    ['宜兴紫砂石瓢壶', 'Yixing zisha shipiao teapot, unglazed reddish brown fine clay, triangular taper body, straight spout, curved handle, fitted lid'],
    ['宜兴紫砂西施壶', 'Yixing zisha xishi teapot, unglazed purple brown clay, round plump body, short spout, inverted ear handle, round lid knob'],
    ['钧瓷双耳尊', 'Jun ware ceramic zun vase, sky blue opalescent glaze with natural purple splashes, two handles, thick rounded body'],
    ['磁州窑白地黑花枕', 'Cizhou ceramic pillow, bean shaped curved top, white slip with black painted peony, brown exposed base'],
    ['建窑兔毫盏', 'Jian ware tea bowl, conical deep bowl, dark iron glaze with fine radial golden hare fur streaks, small foot ring']
  ]],
  ['陶塑', 'clay', [
    ['凤翔泥塑坐虎', 'Fengxiang painted clay seated tiger, exaggerated round eyes, broad chest, white base, red green yellow black folk floral motifs'],
    ['凤翔泥塑挂虎', 'Fengxiang clay tiger face wall plaque, shallow sculpted face, round eyes, pointed ears, white red green painted folk patterns'],
    ['惠山泥人大阿福', 'Huishan clay Da Afu chubby child figurine holding a small lion, round smiling face, bright traditional jacket, seated posture'],
    ['北京兔儿爷', 'Beijing clay Tuerye rabbit deity figurine, long upright ears, white rabbit face, red ceremonial armor, upright seated pose'],
    ['浚县泥咕咕公鸡', 'Xun county Nigugu clay rooster whistle, small hollow black fired clay bird, upright tail, sparse red yellow green dots'],
    ['浚县泥咕咕燕子', 'Xun county Nigugu clay swallow whistle, black clay, compact rounded bird body, pointed tail, simple colored strokes'],
    ['聂家庄泥叫虎', 'Nie village clay roaring tiger toy, two joined yellow clay body sections with bellows waist, bold black stripes, open red mouth'],
    ['淮阳泥泥狗双头兽', 'Huaiyang Ninigou black clay double headed folk guardian animal, archaic compact form, colored geometric dots and lines'],
    ['淮阳泥泥狗人面猴', 'Huaiyang Ninigou black clay human faced monkey whistle, upright compact silhouette, white red yellow geometric markings'],
    ['石湾陶塑渔翁', 'Shiwan ceramic old fisherman figurine, unglazed expressive face, glazed brown robe, straw hat, seated with a woven fishing basket']
  ]],
  ['织绣', 'textile', [
    ['苗绣蝴蝶纹背扇', 'Miao embroidered baby carrier panel displayed upright, dark indigo fabric, symmetrical butterfly and spiral embroidery, thick textile seams'],
    ['苗绣鸟纹香囊', 'Miao embroidered hanging sachet, dark fabric pouch, dense brightly colored bird and spiral motifs, short tassels'],
    ['苏绣牡丹团扇', 'Suzhou embroidered round silk fan, translucent ivory silk, realistic pink peony embroidery, slim bamboo handle'],
    ['湘绣虎纹屏风', 'Small single panel Hunan embroidery tabletop screen, lifelike tiger embroidered on silk, dark wood rectangular frame and two feet'],
    ['蜀绣芙蓉团扇', 'Sichuan silk embroidered round fan, pink hibiscus flowers and green leaves, ivory silk, polished wood handle'],
    ['粤绣金线挂饰', 'Cantonese embroidery hanging ornament, crimson silk ground, raised gold couching thread forming symmetrical peonies, gold fringe'],
    ['南京云锦如意袋', 'Nanjing yunjin brocade drawstring pouch, crimson silk with woven gold auspicious cloud patterns, structured round base'],
    ['宋锦眼镜盒', 'Song brocade hard spectacle case, elongated rounded rectangular form, small repeating geometric floral silk weave, blue and gold'],
    ['侗锦织纹挎包', 'Dong brocade shoulder bag, black red white woven geometric diamonds, rectangular fabric body, narrow woven strap'],
    ['黎锦几何纹腰包', 'Li brocade waist pouch, dark handwoven fabric with red yellow geometric human and animal motifs, compact rectangular shape']
  ]],
  ['竹编', 'bamboo', [
    ['东阳竹编提篮', 'Dongyang woven bamboo basket with single arched handle, fine split bamboo open lattice, warm honey color, tight rim'],
    ['青神竹编茶筒', 'Qingshen bamboo woven cylindrical tea canister with fitted lid, ultra fine natural bamboo strips, dense diagonal weave'],
    ['瓷胎竹编茶杯', 'Sichuan porcelain bodied bamboo woven tea cup, ivory porcelain rim visible, fine golden bamboo strips wrapping body precisely'],
    ['道明竹编果盘', 'Daoming bamboo woven shallow fruit tray, circular form, radial interlaced bamboo strips, reinforced circular rim'],
    ['嵊州竹编花瓶', 'Shengzhou bamboo woven vase, tall pear shaped form, thin golden bamboo strips woven diagonally, narrow opening'],
    ['竹编鱼篓', 'Traditional Chinese bamboo fish creel, rounded basket body, narrow inward funnel mouth, coarse diagonal natural bamboo weave'],
    ['竹编斗笠', 'Chinese handwoven conical bamboo rain hat, broad cone, dense radial bamboo weave, reinforced round rim'],
    ['竹编团扇', 'Chinese round bamboo hand fan, fine pale bamboo lattice weave, narrow bamboo handle, curved reinforced edge'],
    ['竹编六角灯罩', 'Chinese hexagonal bamboo woven lantern shade, six framed lattice faces, bamboo strips, no electric parts'],
    ['竹编双耳收纳筐', 'Traditional Chinese rectangular bamboo basket with two small loop handles, herringbone weave, bound corners']
  ]],
  ['漆器', 'lacquer', [
    ['福州脱胎漆器花瓶', 'Fuzhou bodiless lacquer vase, light thin walls, deep polished burgundy lacquer, restrained gold floral decoration, narrow neck'],
    ['平遥推光漆器首饰盒', 'Pingyao polished lacquer jewelry box, rounded rectangular black body, hand painted gold floral scrolls, fitted lid'],
    ['扬州螺钿漆盒', 'Yangzhou black lacquer round box with mother of pearl inlaid lotus flowers, iridescent shell pieces, smooth fitted lid'],
    ['北京雕漆牡丹盒', 'Beijing carved cinnabar lacquer round box, thick red lacquer relief peony petals on geometric background, lid and base'],
    ['天水雕漆托盘', 'Tianshui carved lacquer rectangular tray, dark polished lacquer, shallow carved red floral borders, rounded corners'],
    ['成都银丝漆碗', 'Chengdu lacquer bowl, black glossy finish with delicate embedded silver wire floral scrolls, small foot ring'],
    ['彝族漆器木碗', 'Yi ethnic wooden lacquer bowl, black red yellow geometric bands, pedestal foot, bold contrasting hand painted patterns'],
    ['彝族漆器木杯', 'Yi ethnic lacquer wooden goblet, tall narrow stem and rounded cup, black red yellow triangular decorative bands'],
    ['金漆镶嵌笔筒', 'Chinese black lacquer cylindrical brush pot with gold and mother of pearl floral inlays, open hollow interior'],
    ['脱胎漆器莲花盘', 'Fuzhou bodiless lacquer lotus shaped plate, shallow scalloped petals, deep red polished lacquer, fine gold edges']
  ]],
  ['金工', 'metal', [
    ['景泰蓝莲纹赏瓶', 'Chinese cloisonne enamel vase, blue turquoise enamel ground, fine gilded copper wire lotus cells, brass rim and base'],
    ['景泰蓝三足香炉', 'Chinese cloisonne incense burner, round enamel body, two curved brass handles, three short feet, blue floral enamel lid'],
    ['苗族银角头饰', 'Miao silver horn headdress, symmetrical tall curved silver horns, chased floral relief crown band, traditional ceremonial form'],
    ['苗族银项圈', 'Miao silver neck ring necklace, thick spiral curved metal torc, engraved geometric bands, front opening'],
    ['苗族银蝴蝶发簪', 'Miao silver butterfly hairpin, filigree butterfly wings with dangling small silver pendants, long pin shaft'],
    ['鹤庆银壶', 'Heqing hammered silver teapot, round hammered body, arched overhead handle, curved spout, chased floral lid'],
    ['花丝镶嵌花篮', 'Chinese filigree miniature silver flower basket, extremely fine coiled metal wires, arched handle, small floral wire motifs'],
    ['芜湖铁画梅花屏', 'Wuhu iron painting tabletop screen, forged black iron plum branches and flowers in rectangular frame, white backing, two feet'],
    ['铜胎錾刻茶罐', 'Chinese chased copper cylindrical tea caddy with lid, warm reddish copper, engraved lotus scrolls, hand hammered texture'],
    ['斑铜双耳瓶', 'Yunnan spotted copper vase, two small ring handles, mottled crystalline red and gold copper surface, rounded body']
  ]],
  ['木雕', 'wood', [
    ['东阳木雕花鸟插屏', 'Dongyang wood carved tabletop screen, layered shallow relief birds and peonies, light camphor wood, rectangular frame and two feet'],
    ['黄杨木雕牧童', 'Boxwood carving of a seated Chinese shepherd boy holding a bamboo flute, honey yellow fine wood grain, compact smooth sculpture'],
    ['潮州木雕蟹篓', 'Chaozhou gilded wood carving of crab basket, layered openwork bamboo basket and crabs, rich gold leaf, intricate organic details'],
    ['剑川木雕梅花笔筒', 'Jianchuan wood carved cylindrical brush pot, dark brown wood, raised plum blossoms and branches, hollow open top'],
    ['徽州木雕雀替', 'Huizhou carved wooden architectural bracket, triangular curved outline, relief floral scrolls, aged brown wood, standalone bracket'],
    ['曲阳石雕小狮', 'Quyang white marble guardian lion sculpture, seated on small square plinth, curled mane, rounded traditional Chinese lion face'],
    ['青田石雕葡萄', 'Qingtian stone carving of hanging grape cluster and leaves, natural translucent pale green and ochre stone, small stable base'],
    ['寿山石雕印章', 'Shoushan stone square seal with carved reclining mythical beast knob, warm translucent honey yellow stone, no engraved text'],
    ['玉雕如意', 'Chinese jade carved ruyi scepter, curved slim handle, cloud shaped head with shallow relief, pale green translucent jade'],
    ['核雕十八罗汉珠', 'Chinese olive pit miniature carving bead, elongated oval brown nut, multiple tiny expressive arhat faces in relief, drilled end holes']
  ]],
  ['灯彩', 'lantern', [
    ['秦淮荷花灯', 'Qinhuai lotus lantern, layered pink translucent paper petals, yellow center, slim bamboo framework, circular base'],
    ['秦淮兔子灯', 'Qinhuai rabbit lantern, white translucent paper over bamboo frame, long ears, red eyes, small wooden wheels'],
    ['硖石六角宫灯', 'Xiashi hexagonal palace lantern, delicate pierced colored paper panels on bamboo frame, red hanging tassels'],
    ['泉州花灯绣球灯', 'Quanzhou spherical silk lantern, colorful pierced floral paper panels, gold edged ribs, short red tassel'],
    ['藁城红纱宫灯', 'Gaocheng red gauze palace lantern, plump ribbed red silk body, gold bands at top and bottom, red tassel'],
    ['汴京鲤鱼灯', 'Bianjing carp lantern, red orange translucent paper fish with scale patterns, bamboo frame, curved tail and fins'],
    ['潍坊沙燕风筝', 'Weifang swallow kite, flat bamboo frame with painted paper wings, black white red symmetrical swallow motifs, forked tail'],
    ['潍坊蝴蝶风筝', 'Weifang butterfly kite, flat bamboo frame, large symmetrical brightly painted paper wings with floral patterns'],
    ['南通板鹞风筝', 'Nantong banyao kite, flat hexagonal bamboo and paper body, arranged small bamboo whistles on front, colorful folk patterns'],
    ['北京沙燕风筝', 'Beijing traditional fat swallow kite, broad curved shoulders, painted swallow face and peony motifs, symmetrical flat bamboo paper form']
  ]],
  ['民俗', 'folk', [
    ['陕西布老虎', 'Shaanxi stuffed cloth tiger, squat body with four stubby legs, oversized head, yellow cotton fabric, black stripes and stitched red mouth'],
    ['山东布老虎', 'Shandong cloth tiger pillow, vivid red cotton, upright ears, large embroidered eyes, floral applique and curled cloth tail'],
    ['庆阳香包石榴', 'Qingyang embroidered pomegranate sachet, red silk padded fruit shape, green embroidered leaves, multicolor thread tassels'],
    ['庆阳香包莲花', 'Qingyang embroidered lotus sachet, pink padded silk petals, green fabric leaves, bright embroidered details and short tassels'],
    ['满族荷包', 'Manchu embroidered pouch, flattened rounded silk body, blue satin, symmetrical floral embroidery, drawstrings and tassels'],
    ['壮族绣球', 'Zhuang embroidered silk ball, twelve padded colorful cloth panels, floral embroidery, small tassels and hanging cord'],
    ['传统盘长中国结', 'Chinese pan chang knot, single thick red braided cord forming symmetrical interwoven endless knot, two hanging tassels'],
    ['传统如意中国结', 'Chinese ruyi decorative knot, red braided silk cord in symmetrical rounded loops, compact central knot and two tassels'],
    ['天津风筝魏金鱼', 'Tianjin Wei goldfish kite, bamboo frame with brightly painted silk, bulging eyes, fanned tail, red gold patterns'],
    ['面塑寿桃', 'Chinese traditional dough sculpture longevity peach, smooth pink white dough peach with green leaves, small round platter']
  ]],
  ['戏曲与乐器', 'performance', [
    ['唐山皮影旦角', 'Tangshan shadow puppet female opera figure, flat translucent brown hide, pierced floral robe, articulated limbs, slender face profile'],
    ['陕西皮影武生', 'Shaanxi shadow puppet warrior figure, flat translucent painted hide, perforated armor motifs, articulated limbs, sharp face profile'],
    ['泉州提线木偶旦角', 'Quanzhou marionette female opera puppet, carved painted wooden head, embroidered silk robe, slender wooden hands, no hanging strings'],
    ['漳州布袋木偶生角', 'Zhangzhou glove puppet male opera character, carved painted wooden head, fabric robe forming glove body, tiny wooden hands'],
    ['京剧凤冠', 'Peking opera phoenix crown headdress, blue kingfisher style decoration, gold wire phoenix ornaments, white pearl bead fringe'],
    ['京剧盔头将帅盔', 'Peking opera general helmet headdress, symmetrical domed crown, gold embroidered decoration, red pompons, two side panels'],
    ['傩戏木雕面具', 'Chinese Nuo theater carved wooden guardian mask, bold red black painted face, bulging eyes, bared teeth, deep carved features'],
    ['古琴', 'Chinese guqin seven string zither, long narrow dark lacquered wooden body, rounded upper end, thirteen inlaid dots, seven taut strings'],
    ['葫芦丝', 'Yunnan hulusi instrument, natural golden gourd wind chamber, three parallel bamboo pipes extending downward, simple dark binding'],
    ['侗族芦笙', 'Dong lusheng wind instrument, wooden wind chest with six graduated bamboo pipes extending upward, dark wood mouthpiece']
  ]]
];

const catalog = groups.flatMap(([category, group, entries], groupIndex) => entries.map(([name, detail], itemIndex) => ({
  id: `heritage-${String(groupIndex * 10 + itemIndex + 1).padStart(3, '0')}`,
  name, category, group,
  prompt: `${detail}. Refined handcrafted museum miniature matching a realistic Chinese heritage collection: faithful traditional proportions, elegant clean silhouette, crisp intricate culturally appropriate ornament, rich balanced traditional pigments, tactile natural material and subtle handworked detail. Soft broad reflections appropriate to the material, neutral unlit albedo without baked highlights or shadows; no plastic gloss, no exaggerated cartoon anatomy, no blurred ornament. One complete standalone object, no background, no scene, no pedestal unless described, no floating parts, no text, no logo.`,
  faceLimit: 12000,
  provenance: 'AI 生成的传统工艺风格展示模型，非文物扫描复刻；需逐件审核形制和纹样。'
})));
if (catalog.length !== 100 || new Set(catalog.map(item => item.name)).size !== 100) throw new Error('Catalog must contain 100 distinct objects');
module.exports = catalog;
