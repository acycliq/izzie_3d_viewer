import * as THREE from "./libs/three.js/build/three.module.js";

// Constants
const MATERIAL_PROPS = {
    FRONT: {
        side: THREE.FrontSide,
        opacity: 0.05, // from 0.4
        name: 'front_mesh'
    },
    BACK: {
        side: THREE.BackSide,
        opacity: 0.9,
        name: 'back_mesh'
    },
    BASE: {
        clearcoat: 1.0,
        clearcoatRoughness: 0,
        metalness: 0.065,
        roughness: 0.3,
        transmission: 0.0,
        transparent: true,
    }
};

const LOD_LEVELS = {
    NEAR: { distance: 300, segments: 16 },
    MEDIUM: { distance: 1000, segments: 8 },
    FAR: { distance: Infinity, segments: 4 }
};

// Reusable objects
const _dummy = new THREE.Object3D();
const _vector = new THREE.Vector3();
const _loader = new THREE.TextureLoader();

// Performance monitoring
const _perfMonitor = {
    startTime: 0,
    endTime: 0,
    start() {
        this.startTime = performance.now();
    },
    end(label) {
        this.endTime = performance.now();
        console.log(`${label}: ${(this.endTime - this.startTime).toFixed(2)}ms`);
    }
};

// Cell Mesh Creation
function make_cells_2(data) {
    _perfMonitor.start();
    
    try {
        const NON_ZERO_CELLS = data.filter(d => d.topClass !== 'ZeroXXX');
        
        const result = {
            front_face: ellipsoids_2(NON_ZERO_CELLS, MATERIAL_PROPS.FRONT),
            back_face: ellipsoids_2(NON_ZERO_CELLS, MATERIAL_PROPS.BACK)
        };
        
        _perfMonitor.end('Cell creation');
        return result;
    } catch (error) {
        console.error('Error in make_cells_2:', error);
        throw error;
    }
}

function ellipsoids_2(data, props) {
    const counts = data.length;                    // Total number of non-zero cells to be rendered
    let flakesTexture, material, geometry, instancedMesh;
    
    try {
        // Load and configure normal map texture for cell surface detail
        flakesTexture = _loader.load(
            './src/flakes.png',                    // Normal map for cell surface irregularities
            undefined,
            undefined,
            (error) => {                           // Handle texture loading failures gracefully
                console.error('Error loading texture:', error);
                material.normalMap = null;          // Fallback: use smooth surface if texture fails
                material.needsUpdate = true;
            }
        );
        
        // Setup basic 3D elements needed for cell visualization
        material = createMaterial(flakesTexture, props);    // Create physical material with normal mapping
        geometry = createGeometry(LOD_LEVELS.NEAR.segments);// Create sphere geometry with high detail for near view
        instancedMesh = createInstancedMesh(               // Create efficient instanced mesh for multiple cells
            geometry, 
            material, 
            counts                                         // Allocate space for all cells
        );
        
        // Configure individual cell positions, scales, and colors
        updateInstances(instancedMesh, data, counts);      // Update transform matrices and colors for each cell
        
        // [4] LOD SETUP - Configure level of detail for performance optimization
        const lodController = createLODController(         // Setup automatic detail adjustment based on distance
            instancedMesh, 
            geometry
        );
        
        // Package mesh and controllers with cleanup function
        return {
            instancedMesh,                                 // Main renderable mesh containing all cells
            lodController,                                 // Controls detail level based on camera distance
            dispose: () => {                         // Cleanup function to prevent memory leaks
                geometry.dispose();                        // Free geometry buffers
                material.dispose();                        // Free material resources
                flakesTexture.dispose();                  // Free texture resources
                instancedMesh.dispose();                  // Free instance buffers
            }
        };
    } catch (error) {
        // Clean up all allocated resources if anything fails
        if (geometry) geometry.dispose();                 // Free geometry if created
        if (material) material.dispose();                 // Free material if created
        if (flakesTexture) flakesTexture.dispose();      // Free texture if loaded
        if (instancedMesh) instancedMesh.dispose();      // Free instance data if created
        throw error;
    }
}

function createLODController(mesh, baseGeometry) {
    const geometries = new Map();
    
    // Create geometries for different LOD levels
    Object.values(LOD_LEVELS).forEach(level => {
        geometries.set(
            level.distance,
            new THREE.SphereBufferGeometry(1, level.segments, Math.floor(level.segments * 0.5))
        );
    });
    
    return {
        update: (camera) => {
            const distance = camera.position.distanceTo(mesh.position);
            
            // Find appropriate LOD level
            const level = Object.values(LOD_LEVELS).find(l => distance < l.distance);
            const newGeometry = geometries.get(level.distance);
            
            // Update geometry if needed
            if (mesh.geometry !== newGeometry) {
                mesh.geometry.dispose();
                mesh.geometry = newGeometry;
            }
        },
        dispose: () => {
            geometries.forEach(geometry => geometry.dispose());
            geometries.clear();
        }
    };
}

function createMaterial(flakesTexture, props) {
    const material = new THREE.MeshPhysicalMaterial({
        ...MATERIAL_PROPS.BASE,
        normalMap: flakesTexture,
        normalScale: new THREE.Vector2(0.3, 0.3),
        side: props.side,
        opacity: props.opacity
    });
    
    material.normalMap.wrapS = material.normalMap.wrapT = THREE.RepeatWrapping;
    material.normalMap.repeat.set(30, 30);
    
    return material;
}

function createGeometry(segments = 16) {
    const heightSegments = Math.floor(segments * 0.5);
    return new THREE.SphereBufferGeometry(1, segments, heightSegments);
}

function createInstancedMesh(geometry, material, counts) {
    const mesh = new THREE.InstancedMesh(geometry, material, counts);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    return mesh;
}

function updateInstances(instancedMesh, data, counts) {
    const scale = { x: 10, y: 10, z: 10 };
    
    _perfMonitor.start();
    
    for (let i = 0; i < counts; i++) {
        const item = data[i];
        
        _dummy.position.set(item.x, item.y, item.z);
        _dummy.scale.set(scale.x * 0.99, scale.y * 0.99, scale.z * 0.99);
        _dummy.updateMatrix();
        
        instancedMesh.setMatrixAt(i, _dummy.matrix);
        instancedMesh.setColorAt(i, new THREE.Color(
            item.r / 255.0,
            item.g / 255.0,
            item.b / 255.0
        ));
    }
    
    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.instanceColor.needsUpdate = true;
    
    _perfMonitor.end('Instance updates');
}

// Tree Structure
function tree(data) {
    // makes the tree object to pass into the tree control as an overlay
    var mapper = {},
        root = {
            text: 'Cell Classes',
            selectAllCheckbox: 'Un/select all',
            children: []
        };

    for (var str of data) {
        var sep = '.', //configSettings.class_name_separator,
            splits,
            text = '';
        // let splits = str.match(/[a-zA-Z]+|[0-9]+/g), //str.split('.'),
        if (sep === '') {
            console.log('Assuming that class name is a string followed by a number, like Astro1, Astro2 etc');
            splits = str.match(/[a-zA-Z]+|[0-9]+/g) //str.split('.'),
        } else {
            splits = str.split(sep)
        }
        ;
        splits.reduce(myReducer(text), root)
    }

    function myReducer(text) {
        return function (parent, place, i, arr) {
            if (text) {
                var sep = '.'; //configSettings.class_name_separator;
                text += sep + `${place}`; // `.${place}`;
            } else
                text = place;

            if (!mapper[text]) {
                var o = {text: text};
                // o.id = text;
                o.collapsed = true;
                if (i === arr.length - 1) {
                    o.layer = text
                    o.id = text
                    // o.layer = masterCellContainer.getChildByName(label);
                }
                mapper[text] = o;
                parent.selectAllCheckbox = true;
                parent.children = parent.children || [];
                parent.children.push(o)
            }
            return mapper[text];
        }
    }

    return root
}

// UI Components
function myjsTree(treeData) {

    // Create an jstree instance
    $('#jstree_demo').jstree({ // config object start

      "core": {                    // core config object
        "mulitple": false,         // disallow multiple selection
        "animation": 100,          // 200ms is default value
        "check_callback" : true,   // this make contextmenu plugin to work
        "themes": {
            "variant": "medium",
            "dots": false,
            "icons":false
        },

        "data": treeData
      }, // core end

      // Types plugin
      "types" : {
        "default" : {
          "icon" : "glyphicon glyphicon-flash"
        },
        "demo" : {
          "icon" : "glyphicon glyphicon-th-large"
        }
      },

      // config object for Checkbox plugin (declared below at plugins options)
      "checkbox": {
        "keep_selected_style": false,  // default: false
        "three_state": true,           // default: true
        "whole_node": true             // default: true
      },

      "conditionalselect" : function (node, event) {
        return false;
      },

      // injecting plugins
      "plugins" : [
            "checkbox",
            "contextmenu",
            "types",
            "unique",
            "changed"
      ]
    }); // config object end

     // AJAX loading JSON Example:
     $('#jstree_ajax_demo').jstree({
      'core': {
        'data': {
          "url" : "https://codepen.io/stefanradivojevic/pen/dWLZOb.js",
          "dataType" : "json" // needed only if you do not supply JSON headers
        }
      },
      // Types plugin
      "types" : {
        "default" : {
          "icon" : "glyphicon glyphicon-record"
        }
      },
       "plugins" : [ "types", "unique" ]
    });

    // Listen for events - example
    $('#jstree_demo').on("changed.jstree", function (e, data) {
      // changed.jstree is a event
      console.log('selected: ' + data.changed.selected);
      console.log('deselected: ' + data.changed.deselected);
    });

  };

// Utility Functions
function count_triangles(m){
    // input m is the mesh
    var _n = m.geometry.index.count/3;
    var count = m.count;
    console.log('triangles: ' + (_n * count).toLocaleString());
}

// Single export statement for all exports
export { make_cells_2 as default, tree, myjsTree };

