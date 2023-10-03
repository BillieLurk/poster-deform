import {
  Scene,
  WebGLRenderer,
  PerspectiveCamera,
  PlaneGeometry,
  Vector2,
  MeshPhysicalMaterial,
  TextureLoader,
  Mesh,
  Clock,
  DirectionalLight,
  AmbientLight,
  PointLight,
  Raycaster
} from 'three';

import poster from '../src/textures/poster2.webp'

class App {
  #mouse = new Vector2();
  #raycaster = new Raycaster();
  #rippleBuffer1;
  #rippleBuffer2;
  #resizeCallback = () => this.#onResize();

  constructor(container) {
    this.container = document.querySelector(container);
    this.screen = new Vector2(this.container.clientWidth, this.container.clientHeight);
    this.#rippleBuffer1 = [];
    this.#rippleBuffer2 = [];
    window.addEventListener('mousemove', this.#onMouseMove, false);
  }

  async init() {
    this.#createScene();
    this.#createCamera();
    this.#createRenderer();
    await this.createPlane();
    this.initRippleBuffers(this.fullscreenPlane.geometry);
    this.#createLight();
    this.renderer.setAnimationLoop(() => {
      this.#update();
      this.#render();
    });
  }

  initRippleBuffers(geometry) {
    const vertices = geometry.attributes.position.array;
    const len = vertices.length / 3;
    this.#rippleBuffer1 = new Float32Array(len).fill(0);
    this.#rippleBuffer2 = new Float32Array(len).fill(0);
  }

  #onMouseMove = (event) => {
    this.#mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.#mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.#raycaster.setFromCamera(this.#mouse, this.camera);

    const intersection = this.#getIntersection();
    if (intersection) {
      this.triggerRipple(intersection, 0.03);
    }
  }

  #getIntersection() {
    const intersects = this.#raycaster.intersectObject(this.fullscreenPlane);
    if (intersects.length > 0) {
      return intersects[0].point;
    }
    return null;
  }

  triggerRipple(point, intensity = 1000) {
    const { x, y } = point;
    const geometry = this.fullscreenPlane.geometry;
    const vertices = geometry.attributes.position.array;
    const len = vertices.length / 3;

    for (let i = 0; i < len; ++i) {
      const dx = vertices[i * 3] - x;
      const dy = vertices[i * 3 + 1] - y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      const waveSize = 1
      if (distance < waveSize) {
        this.#rippleBuffer1[i] -= intensity * (waveSize - distance);
      }
    }
  }

  updateRipple() {
    const damping = 0.99;
    const spread = 0.5;
    const buffer1 = this.#rippleBuffer1;
    const buffer2 = this.#rippleBuffer2;
    const len = buffer1.length;
    const width = 181;

    for (let i = 0; i < len; ++i) {
      let sum = 0;

      // Check for horizontal neighbors
      if (i % width !== 0) {
        sum += buffer1[i - 1];
      }

      if ((i + 1) % width !== 0) {
        sum += buffer1[i + 1];
      }

      // Check for vertical neighbors
      if (i >= width) {
        sum += buffer1[i - width];
      }
      if (i < len - width) {
        sum += buffer1[i + width];
      }

      sum *= spread;
      buffer2[i] = (sum - buffer2[i]) * damping;
    }

    [this.#rippleBuffer1, this.#rippleBuffer2] = [this.#rippleBuffer2, this.#rippleBuffer1];
    const vertices = this.fullscreenPlane.geometry.attributes.position.array;

    for (let i = 0; i < len; ++i) {
      const zIdx = i * 3 + 2;
      vertices[zIdx] = 3 * buffer2[i];
    }

    this.fullscreenPlane.geometry.attributes.position.needsUpdate = true;
  }

  #update() {
    this.#raycaster.setFromCamera(this.#mouse, this.camera);
    this.updateRipple();
    const positionAttribute = this.fullscreenPlane.geometry.getAttribute('position');
    this.fullscreenPlane.geometry.computeVertexNormals();
    positionAttribute.needsUpdate = true;
    this.fullscreenPlane.geometry.verticesNeedUpdate = true;
  }

  #render() {
    this.renderer.render(this.scene, this.camera);
  }

  #createScene() {
    this.scene = new Scene();
  }

  #createCamera() {
    this.camera = new PerspectiveCamera(75, this.screen.x / this.screen.y, 0.1, 100);
    this.camera.position.set(0, 0, 10);
  }

  #createRenderer() {
    this.renderer = new WebGLRenderer({
      alpha: true,
      antialias: window.devicePixelRatio === 1
    });
    this.container.appendChild(this.renderer.domElement);
    this.renderer.setSize(this.screen.x, this.screen.y);
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
    this.renderer.setClearColor(0x121212);
  }

  #createLight() {
    // Create a directional light
    this.light = new DirectionalLight(0xffffff, 0);
    this.light.position.set(1, 100, 1);


    // Create an ambient light
    this.ambientLight = new AmbientLight(0xffffff, 0.2);

    // Create a point light
    const pointLight = new PointLight(0xffffff, 1.5, 300, 0);
    pointLight.position.set(4, 4, 10);
    pointLight.castShadow = true


    // Add lights to the scene

    this.scene.add(this.ambientLight);
    this.scene.add(pointLight); // Add the point light
  }

  async createPlane() {
    const textureLoader = new TextureLoader();
    const planeTexture = textureLoader.load(poster);
    const material = new MeshPhysicalMaterial({
      map: planeTexture,
      wireframe: false,
      color: 0xffffff,
      roughness: 0.6,
      metalness: 0.2,
    });
    const geometry = new PlaneGeometry(10, 10 * 1.4, 180, 180 * 1.4);
    this.fullscreenPlane = new Mesh(geometry, material);
    this.fullscreenPlane.position.z = 0;
    this.scene.add(this.fullscreenPlane);
  }

  #onResize() {
    this.screen.set(this.container.clientWidth, this.container.clientHeight);
    this.camera.aspect = this.screen.x / this.screen.y;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.screen.x, this.screen.y);
  }
}

const app = new App('#app');
app.init();
