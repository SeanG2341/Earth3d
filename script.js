// Scene, Camera, Renderer
let renderer = new THREE.WebGLRenderer();
let scene = new THREE.Scene();
let aspect = window.innerWidth / window.innerHeight;
let camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1500);
let cameraRotation = 0;
let cameraRotationSpeed = 0.001;
let cameraAutoRotation = true;
let orbitControls = new THREE.OrbitControls(camera);


let spotLight = new THREE.SpotLight(0xffffff, 1, 0, 10, 2);

// Texture Loader
let textureLoader = new THREE.TextureLoader();

// Planet Proto
let planetProto = {
  sphere: function (size) {
    let sphere = new THREE.SphereGeometry(size, 32, 32);
    return sphere;
  },
  material: function (options) {
    let material = new THREE.MeshPhongMaterial();
    if (options) {
      for (var property in options) {
        material[property] = options[property];
      }
    }
    return material;
  },
  glowMaterial: function (intensity, fade, color) {
    let glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        'c': { type: 'f', value: intensity },
        'p': { type: 'f', value: fade },
        glowColor: { type: 'c', value: new THREE.Color(color) },
        viewVector: { type: 'v3', value: camera.position }
      },
      vertexShader: `
        uniform vec3 viewVector;
        uniform float c;
        uniform float p;
        varying float intensity;
        void main() {
          vec3 vNormal = normalize( normalMatrix * normal );
          vec3 vNormel = normalize( normalMatrix * viewVector );
          intensity = pow( c - dot(vNormal, vNormel), p );
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `
        uniform vec3 glowColor;
        varying float intensity;
        void main() {
          vec3 glow = glowColor * intensity;
          gl_FragColor = vec4( glow, 1.0 );
        }`,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true
    });
    return glowMaterial;
  },
  texture: function (material, property, uri) {
    let textureLoader = new THREE.TextureLoader();
    textureLoader.crossOrigin = true;
    textureLoader.load(
      uri,
      function (texture) {
        material[property] = texture;
        material.needsUpdate = true;
      });
  }
};

// Create planet function
let createPlanet = function (options) {
  // Create the planet's Surface
  let surfaceGeometry = planetProto.sphere(options.surface.size);
  let surfaceMaterial = planetProto.material(options.surface.material);
  let surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);

  // Create the planet's Atmosphere
  let atmosphereGeometry = planetProto.sphere(options.surface.size + options.atmosphere.size);
  let atmosphereMaterialDefaults = {
    side: THREE.DoubleSide,
    transparent: true
  };

  let atmosphereMaterialOptions = Object.assign(atmosphereMaterialDefaults, options.atmosphere.material);
  let atmosphereMaterial = planetProto.material(atmosphereMaterialOptions);
  let atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);

  // Create the planet's Atmospheric glow
  let atmosphericGlowGeometry = planetProto.sphere(options.surface.size + options.atmosphere.size + options.atmosphere.glow.size);
  let atmosphericGlowMaterial = planetProto.glowMaterial(options.atmosphere.glow.intensity, options.atmosphere.glow.fade, options.atmosphere.glow.color);
  let atmosphericGlow = new THREE.Mesh(atmosphericGlowGeometry, atmosphericGlowMaterial);

  // Nest the planet's Surface and Atmosphere into a planet object
  let planet = new THREE.Object3D();
  surface.name = 'surface';
  atmosphere.name = 'atmosphere';
  atmosphericGlow.name = 'atmosphericGlow';
  planet.add(surface);
  planet.add(atmosphere);
  planet.add(atmosphericGlow);

  // Load the Surface's textures
  for (let textureProperty in options.surface.textures) {
    planetProto.texture(
      surfaceMaterial,
      textureProperty,
      options.surface.textures[textureProperty]);
  }

  // Load the Atmosphere's texture
  for (let textureProperty in options.atmosphere.textures) {
    planetProto.texture(
      atmosphereMaterial,
      textureProperty,
      options.atmosphere.textures[textureProperty]);
  }

  return planet;
};

// Create Earth model
let earth = createPlanet({
  surface: {
    size: 0.5,
    material: {
      bumpScale: 0.05,
      specular: new THREE.Color('grey'),
      shininess: 10
    },
    textures: {
      map: 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/141228/earthmap1k.jpg',
      bumpMap: 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/141228/earthbump1k.jpg',
      specularMap: 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/141228/earthspec1k.jpg'
    }
  },
  atmosphere: {
    size: 0.003,
    material: {
      opacity: 0.8
    },
    textures: {
      map: 'https://www.solarsystemscope.com/textures/download/8k_earth_daymap.jpg',
      alphaMap: 'https://s3-us-west-2.amazonaws.com/s.cdpn.io/141228/earthcloudmaptrans.jpg'
    },
    glow: {
      size: 0.02,
      intensity: 0.7,
      fade: 7,
      color: 0x93cfef
    }
  }
});

// Updated NEO Data with velocity property
const neoData = [
  { full_name: "Cadmus", a: 2, e: 0.6, i: -65.1, height: 1.4, size: 0.03, velocity: 1 },
  { full_name: "Sisyphus", a: 0.32, e: 0.9, i: 1.1, height: 0.4, size: 0.04, velocity: -1.4 },
  { full_name: "Amor", a: 21, e: 0.2, i: 32.0, height: 0.4, size: 0.02, velocity: 0.6 },
  { full_name: "Moon", a: 4, e: 0.1, i: 5.1, height: 0.9, size: 0.15, velocity: 0.3 },
];

function orbitalToCartesian(a, e, i, theta) {
  const radian = Math.PI / 180;
  i *= radian;  
  theta *= radian;  

  const p = a * (1 - e * e);  
  const r = p / (1 + e * Math.cos(theta));  

  // Calculate position in the orbital plane (before applying inclination)
  const x_orbital = r * Math.cos(theta);
  const y_orbital = r * Math.sin(theta);

  const x = x_orbital;
  const y = y_orbital * Math.cos(i);
  const z = y_orbital * Math.sin(i);

  return { x, y, z };
}

// Function to place NEO markers with individual height, size, and velocity
function placeNEOMarkers() {
    neoData.forEach(neo => {
        neo.theta = 0; // Initialize theta (true anomaly) for each NEO
        const markerMesh = createNEOMarker(neo); // Create the marker

        earth.getObjectByName('surface').add(markerMesh); // Add marker to the earth surface
        neo.mesh = markerMesh; // Save the mesh for updating later
    });
    

    // Function to update positions of NEO markers over time
    function updateMarkers() {
        neoData.forEach(neo => {
            neo.theta += neo.velocity; 

            neo.theta = (neo.theta + 360) % 360;

            const { x, y, z } = orbitalToCartesian(neo.a, neo.e, neo.i, neo.theta);

            const latitude = (Math.asin(z / Math.sqrt(x * x + y * y + z * z)) * 180 / Math.PI);
            const longitude = (Math.atan2(y, x) * 180 / Math.PI);

            const newPosition = markerProto.latLongToVector3(latitude, longitude, 0.4, neo.height);
            neo.mesh.position.copy(newPosition);
        });

        requestAnimationFrame(updateMarkers);
    }

    updateMarkers();
}


// Function to create NEO marker with given properties
function createNEOMarker(neo) {
  const theta = neo.theta; 
  const { x, y, z } = orbitalToCartesian(neo.a, neo.e, neo.i, theta);

  // Convert Cartesian coordinates to latitude and longitude
  const latitude = (Math.asin(z / Math.sqrt(x * x + y * y + z * z)) * 180 / Math.PI);
  const longitude = (Math.atan2(y, x) * 180 / Math.PI);

  // Use individual height and size from neoData
  const markerPosition = markerProto.latLongToVector3(latitude, longitude, 0.4, neo.height);

  // Create the marker with a moon texture
  const markerMesh = markerProto.marker(neo.size, 'https://www.solarsystemscope.com/textures/download/2k_moon.jpg', markerPosition);

  markerMesh.userData.name = neo.full_name; 
  markerMesh.callback = () => {
      document.querySelectorAll('.infoBox').forEach(box => {
          box.style.display = 'none';
      });
      document.getElementById(`marker${index + 1}`).style.display = 'block';
  };
  
  return markerMesh;
}

// Marker Proto (updated to use texture)
let markerProto = {
  latLongToVector3: function latLongToVector3(latitude, longitude, radius, height) {
      var phi = latitude * Math.PI / 180;
      var theta = (longitude - 180) * Math.PI / 180;

      var x = -(radius + height) * Math.cos(phi) * Math.cos(theta);
      var y = (radius + height) * Math.sin(phi);
      var z = (radius + height) * Math.cos(phi) * Math.sin(theta);

      return new THREE.Vector3(x, y, z);
  },
  
  // Use texture instead of color
  marker: function marker(size, textureUrl, vector3Position) {
      let markerGeometry = new THREE.SphereGeometry(size);
      
      // Load the texture using TextureLoader
      let textureLoader = new THREE.TextureLoader();
      let markerMaterial = new THREE.MeshLambertMaterial();

      textureLoader.load(textureUrl, function (texture) {
          markerMaterial.map = texture; // Apply the loaded texture to the material
      });

      let markerMesh = new THREE.Mesh(markerGeometry, markerMaterial);
      markerMesh.position.copy(vector3Position);

      return markerMesh;
  }
};



// Place Marker
let placeMarker = function (object, options) {
  let position = markerProto.latLongToVector3(options.latitude, options.longitude, options.radius, options.height);
  let marker = markerProto.marker(options.size, options.color, position);
  object.add(marker);
};

// Place Marker At Address
let placeMarkerAtAddress = function (address, color) {
  let encodedLocation = address.replace(/\s/g, '+');
  let httpRequest = new XMLHttpRequest();

  httpRequest.open('GET', 'https://maps.googleapis.com/maps/api/geocode/json?address=' + encodedLocation);
  httpRequest.send(null);
  httpRequest.onreadystatechange = function () {
    if (httpRequest.readyState == 4 && httpRequest.status == 200) {
      let result = JSON.parse(httpRequest.responseText);

      if (result.results.length > 0) {
        let latitude = result.results[0].geometry.location.lat;
        let longitude = result.results[0].geometry.location.lng;
      }
    }
  };
};


// Galaxy
let galaxyGeometry = new THREE.SphereGeometry(100, 32, 32);
let galaxyMaterial = new THREE.MeshBasicMaterial({
  side: THREE.BackSide
});

let galaxy = new THREE.Mesh(galaxyGeometry, galaxyMaterial);

// Load Galaxy Textures
textureLoader.crossOrigin = true;
textureLoader.load(
  'https://s3-us-west-2.amazonaws.com/s.cdpn.io/141228/starfield.png',
  function (texture) {
    galaxyMaterial.map = texture;
    scene.add(galaxy);
  });

// Scene, Camera, Renderer Configuration
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

camera.position.set(1, 1, 1);
orbitControls.enabled = !cameraAutoRotation;

scene.add(camera);
scene.add(spotLight);
scene.add(earth);

// Light Configurations
spotLight.position.set(1, 1, 1);

// Mesh Configurations
earth.receiveShadow = true;
earth.castShadow = true;
earth.getObjectByName('surface').geometry.center();

// On window resize, adjust camera aspect ratio and renderer size
window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Main render function
let render = function () {
  earth.getObjectByName('surface').rotation.y += 1 / 32 * 0.01;
  earth.getObjectByName('atmosphere').rotation.y += 1 / 16 * 0.01;
  if (cameraAutoRotation) {
    cameraRotation += cameraRotationSpeed;
    camera.position.y = 0;
    camera.position.x = 2 * Math.sin(cameraRotation);
    camera.position.z = 2 * Math.cos(cameraRotation);
    camera.lookAt(earth.position);
  }
  requestAnimationFrame(render);
  renderer.render(scene, camera);
};

render();

// Place NEO markers
placeNEOMarkers();

// dat.gui
var gui = new dat.GUI();
var guiCamera = gui.addFolder('Camera');
var guiSurface = gui.addFolder('Surface');
var guiMarkers = guiSurface.addFolder('Markers');
var guiAtmosphere = gui.addFolder('Atmosphere');
var guiAtmosphericGlow = guiAtmosphere.addFolder('Glow');

// dat.gui controls object
var cameraControls = new function () {
  this.speed = cameraRotationSpeed;
  this.orbitControls = !cameraAutoRotation;
}();

var surfaceControls = new function () {
  this.rotation = 0;
  this.bumpScale = 0.05;
  this.shininess = 10;
}();

var markersControls = new function () {
  this.address = '';
  this.color = 0xff0000;
  this.placeMarker = function () {
    placeMarkerAtAddress(this.address, this.color);
  };
}();

var atmosphereControls = new function () {
  this.opacity = 0.8;
}();

var atmosphericGlowControls = new function () {
  this.intensity = 0.7;
  this.fade = 7;
  this.color = 0x93cfef;
}();

// dat.gui controls
guiCamera.add(cameraControls, 'speed', 0, 0.1).step(0.001).onChange(function (value) {
  cameraRotationSpeed = value;
});
guiCamera.add(cameraControls, 'orbitControls').onChange(function (value) {
  cameraAutoRotation = !value;
  orbitControls.enabled = value;
});

guiSurface.add(surfaceControls, 'rotation', 0, 6).onChange(function (value) {
  earth.getObjectByName('surface').rotation.y = value;
});
guiSurface.add(surfaceControls, 'bumpScale', 0, 1).step(0.01).onChange(function (value) {
  earth.getObjectByName('surface').material.bumpScale = value;
});
guiSurface.add(surfaceControls, 'shininess', 0, 30).onChange(function (value) {
  earth.getObjectByName('surface').material.shininess = value;
});

guiMarkers.add(markersControls, 'address');
guiMarkers.addColor(markersControls, 'color');
guiMarkers.add(markersControls, 'placeMarker');

guiAtmosphere.add(atmosphereControls, 'opacity', 0, 1).onChange(function (value) {
  earth.getObjectByName('atmosphere').material.opacity = value;
});

guiAtmosphericGlow.add(atmosphericGlowControls, 'intensity', 0, 1).onChange(function (value) {
  earth.getObjectByName('atmosphericGlow').material.uniforms['c'].value = value;
});
guiAtmosphericGlow.add(atmosphericGlowControls, 'fade', 0, 50).onChange(function (value) {
  earth.getObjectByName('atmosphericGlow').material.uniforms['p'].value = value;
});
guiAtmosphericGlow.addColor(atmosphericGlowControls, 'color').onChange(function (value) {
  earth.getObjectByName('atmosphericGlow').material.uniforms.glowColor.value.setHex(value);
});
init();
animate();
