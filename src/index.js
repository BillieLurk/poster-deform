import {
  Scene,
  WebGLRenderer,
  PerspectiveCamera,
  BoxGeometry,
  MeshStandardMaterial,
  Mesh,
  PointLight,
  Clock,
  Vector2,
  PlaneGeometry,
  MeshBasicMaterial,
  Vector3,
  TextureLoader,  // <- Add this
  Object3D,
  MeshPhysicalMaterial,
  HemisphereLight,
  PointLightHelper,
  AmbientLight
} from 'three';
import { BufferAttribute } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import poster from './textures/poster2.webp'
import normal from './textures/roughness.png'

import { SampleShaderMaterial } from './materials/SampleShaderMaterial'
import { gltfLoader } from './loaders'
import { MeshNormalMaterial } from 'three';
import { DirectionalLight } from 'three';

// Add this to the top imports
import { Raycaster } from 'three';
import { clamp } from 'three/src/math/MathUtils';

class App {


  #rippleBuffer1;
  #rippleBuffer2;


  // Add this inside your App class
  #mouse = new Vector2();
  #raycaster = new Raycaster();

  #lastMousePosition = new Vector2();
  #lastMouseTime = null;

  #resizeCallback = () => this.#onResize()

  constructor(container, opts = { physics: false, debug: false }) {
    this.container = document.querySelector(container)
    this.screen = new Vector2(this.container.clientWidth, this.container.clientHeight)

    this.hasPhysics = opts.physics
    this.hasDebug = opts.debug

    this.#rippleBuffer1 = [];
    this.#rippleBuffer2 = [];

    window.addEventListener('mousemove', this.#onMouseMove, false);
  }

  async init() {


    this.#createScene()
    this.#createCamera()
    this.#createRenderer()

    this.#createLight()
    this.#createClock()
    this.#addListeners()
    this.#createControls()
    await this.createPlane();
    this.initRippleBuffers(this.fullscreenPlane.geometry);



    if (this.hasDebug) {
      const { Debug } = await import('./Debug.js')
      new Debug(this)

      const { default: Stats } = await import('stats.js')
      this.stats = new Stats()
      document.body.appendChild(this.stats.dom)
    }

    this.renderer.setAnimationLoop(() => {
      this.stats?.begin()

      this.#update()
      this.#render()

      this.stats?.end()
    })

    console.log(this)
  }

  initRippleBuffers(geometry) {
    const vertices = geometry.attributes.position.array;
    const len = vertices.length / 3;  // each vertex has x, y, z

    this.#rippleBuffer1 = new Float32Array(len).fill(0);
    this.#rippleBuffer2 = new Float32Array(len).fill(0);
  }

  destroy() {
    this.renderer.dispose()
    this.#removeListeners()
    window.removeEventListener('mousemove', this.#onMouseMove, false);
  }

  getMouseSpeed() {
    if (this.#lastMouseTime === null) {
      this.#lastMousePosition.copy(this.#mouse);
      this.#lastMouseTime = performance.now();

      return { speedVector: new Vector2(0, 0), overallSpeed: 0 };
    }

    const currentTime = performance.now();
    const deltaTime = (currentTime - this.#lastMouseTime) / 1000;  // Time in seconds

    if (deltaTime <= 0) return { speedVector: new Vector2(0, 0), overallSpeed: 0 };

    const dx = this.#mouse.x - this.#lastMousePosition.x;
    const dy = this.#mouse.y - this.#lastMousePosition.y;

    const speedX = dx / deltaTime;
    const speedY = dy / deltaTime;

    const overallSpeed = Math.sqrt(speedX * speedX + speedY * speedY);

    this.#lastMousePosition.copy(this.#mouse);
    this.#lastMouseTime = currentTime;

    return { speedVector: new Vector2(speedX, speedY), overallSpeed };
  }


  #onMouseMove = (event) => {
    this.#mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.#mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Update the raycaster based on the mouse and camera
    this.#raycaster.setFromCamera(this.#mouse, this.camera);

    const intersection = this.#getIntersection();
    if (intersection) {
      this.triggerRipple(intersection, 0.2); // Adjust intensity as needed
    }
  }

  #getIntersection() {
    const intersects = this.#raycaster.intersectObject(this.fullscreenPlane);
    if (intersects.length > 0) {
      return intersects[0].point;
    }
    return null;
  }

  triggerRipple(point, intensity = 10) {
    const { x, y, z } = point;
    const geometry = this.fullscreenPlane.geometry;
    const vertices = geometry.attributes.position.array;
    const len = vertices.length / 3; // each vertex has x, y, z

    for (let i = 0; i < len; ++i) {
      const dx = vertices[i * 3] - x;
      const dy = vertices[i * 3 + 1] - y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < 1) {
        this.#rippleBuffer1[i] += intensity * (1 - distance);
      }
    }
  }





  updateRipple() {
    const damping = 0.98;
    const spread = 0.5;
    const buffer1 = this.#rippleBuffer1;
    const buffer2 = this.#rippleBuffer2;
    const geometry = this.fullscreenPlane.geometry;
    const vertices = geometry.attributes.position.array;
    const len = vertices.length / 3;  // each vertex has x, y, z

    for (let i = 0; i < len; ++i) {
      let sum = 0;
      sum += buffer1[i > 1 ? i - 1 : i];
      sum += buffer1[i < len - 1 ? i + 1 : i];

      // Check for vertical neighbors
      // Assuming vertices are a grid (width * height), for example, 180 * 252
      const width = 181;
      sum += buffer1[i >= width ? i - width : i];
      sum += buffer1[i < len - width ? i + width : i];

      sum *= spread;
      buffer2[i] = (sum - buffer2[i]) * damping;
    }

    for (let i = 0; i < len; ++i) {
      const zIdx = i * 3 + 2; // Index for Z-coordinate in the vertices array
      vertices[zIdx] = buffer2[i];
    }

    // Swap buffers
    [this.#rippleBuffer1, this.#rippleBuffer2] = [this.#rippleBuffer2, this.#rippleBuffer1];

    geometry.attributes.position.needsUpdate = true;
  }




  #update() {
    const elapsed = this.clock.getElapsedTime();

    // Update the raycaster
    this.#raycaster.setFromCamera(this.#mouse, this.camera);

    this.updateRipple();
    const positionAttribute = this.fullscreenPlane.geometry.getAttribute('position');
    // Recalculate the normals
    this.fullscreenPlane.geometry.computeVertexNormals();
    positionAttribute.needsUpdate = true;

    // Required to update the geometry
    this.fullscreenPlane.geometry.verticesNeedUpdate = true;
  }


  #render() {
    this.renderer.render(this.scene, this.camera)
  }

  #createScene() {
    this.scene = new Scene()
  }

  #createCamera() {
    this.camera = new PerspectiveCamera(75, this.screen.x / this.screen.y, 0.1, 100)
    this.camera.position.set(0, 0, 10);

  }

  #createRenderer() {
    this.renderer = new WebGLRenderer({
      alpha: true,
      antialias: window.devicePixelRatio === 1
    })
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement)

    this.renderer.setSize(this.screen.x, this.screen.y)
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio))
    this.renderer.setClearColor(0x121212)
    this.renderer.physicallyCorrectLights = true
  }

  #createLight() {
    // Create a directional light
    this.light = new DirectionalLight(0xffffff, 5);
    this.light.position.set(1, 100, 1);


    // Create an ambient light
    this.ambientLight = new AmbientLight(0xffffff, 2);

    // Create a point light
    const pointLight = new PointLight(0xffffff, 2, 300, 0);
    pointLight.position.set(4, 4, 10);
    pointLight.castShadow = true


    // Add lights to the scene

    this.scene.add(this.ambientLight);
    this.scene.add(pointLight); // Add the point light
  }

  async createPlane() {
    // Create a texture loader instance
    const textureLoader = new TextureLoader();
    const planeTexture = textureLoader.load(poster);
    const planeNormals = textureLoader.load(poster)

    // Create the material for the plane
    const material = new MeshPhysicalMaterial({
      map: planeTexture,
      wireframe: false,
      color: 0xffffff,
      roughness: 0.6, // Add roughness for more realistic interaction with light
      metalness: 0.2,  // Add metalness for more realistic interaction with light
    });

    // Calculate the dimensions of the plane to match the camera's frustum
    const frustumHeight = 2.0 * Math.tan((0.5 * this.camera.fov * Math.PI) / 180.0) * this.camera.position.z;
    const frustumWidth = frustumHeight * this.camera.aspect;

    // Create the plane geometry
    const geometry = new PlaneGeometry(10, 10 * 1.4, 180, 180 * 1.4);
    //const geometry = new PlaneGeometry(frustumWidth, frustumHeight, 100 * this.camera.aspect, 100);

    // Create the mesh
    this.fullscreenPlane = new Mesh(geometry, material);

    // Position the plane to fill the screen
    this.fullscreenPlane.position.z = 0; // At the camera's position

    // Allow the plane to both cast and receive shadows
    this.fullscreenPlane.castShadow = true;
    this.fullscreenPlane.receiveShadow = true;

    // Add it to the scene
    this.scene.add(this.fullscreenPlane);
  }



  #createControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
  }

  #createClock() {
    this.clock = new Clock()
  }

  #addListeners() {
    window.addEventListener('resize', this.#resizeCallback, { passive: true })
  }

  #removeListeners() {
    window.removeEventListener('resize', this.#resizeCallback, { passive: true })
  }

  #onResize() {
    this.screen.set(this.container.clientWidth, this.container.clientHeight)

    this.camera.aspect = this.screen.x / this.screen.y
    this.camera.updateProjectionMatrix()


    this.renderer.setSize(this.screen.x, this.screen.y)
  }
}

window._APP_ = new App('#app', {
  physics: window.location.hash.includes('physics'),
  debug: window.location.hash.includes('debug')
})

window._APP_.init()
