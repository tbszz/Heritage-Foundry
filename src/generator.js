// 创意生成页：创造流程由 creationPanel.js 驱动，这里只接 ThreeScene 载体预览。
import { ThreeScene } from './components/ThreeScene.js';
import { initCreationPanel } from './components/creationPanel.js';

let threeScene = null;

function initGeneratorThreeScene() {
  if (threeScene) return threeScene;

  const container = document.getElementById('three-container');
  if (container) {
    threeScene = new ThreeScene(container);
    threeScene.init();
  }
  return threeScene;
}

document.addEventListener('DOMContentLoaded', () => {
  initCreationPanel(document, {
    applyUrlParams: true,
    onSelectionChange(selection) {
      if (!selection) return;
      initGeneratorThreeScene();
      threeScene?.setCarrier(selection.carrierId);
    },
    onTexture(imageUrl) {
      initGeneratorThreeScene();
      threeScene?.setTexture(imageUrl);
    }
  });
});
