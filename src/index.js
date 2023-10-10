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



  }

  #originalPositionsZ = 0; // You already have this

  #update() {


    const elapsed = this.clock.getElapsedTime();
    //this.controls.update();
    // Update the raycaster
    this.#raycaster.setFromCamera(this.#mouse, this.camera);

    // Check for intersection
    const intersects = this.#raycaster.intersectObject(this.fullscreenPlane);

    const positionAttribute = this.fullscreenPlane.geometry.getAttribute('position');

    const { speedVector, overallSpeed } = this.getMouseSpeed();

    for (let i = 0; i < positionAttribute.count; i++) {
      const vertex = new Vector3();
      vertex.fromBufferAttribute(positionAttribute, i);

      let targetZ = this.#originalPositionsZ;

      if (intersects.length > 0) {
        const { point } = intersects[0];
        const distance = point.distanceTo(vertex);

        const distMult = 1.5
        const amp = 2
        if (distance < Math.PI * distMult) { // Change this to control the radius of the effect
          targetZ = (Math.cos(distance / distMult) + 1) * amp;
        }
      }

      const newZ = vertex.z + (targetZ - vertex.z) * 0.1; // 0.1 is the easing factor
      positionAttribute.setZ(i, newZ);
    }
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
