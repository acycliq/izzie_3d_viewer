import * as THREE from "./libs/three.js/build/three.module.js";
import make_cells_2 from "./stage_cells.module.js";
import {tree, myjsTree} from "./stage_cells.module.js";
import iniLights from "./lights.module.js";

// Constants
const CONSTANTS = {
    MOUSE_THROTTLE_MS: 5,
    MAX_INTERSECTION_DISTANCE: 200,
    COLOR_SCALE: 255.0,
    MATERIAL_SIZE: 0.002,
    INITIAL_CAMERA: {
        x: 11,
        y: 72,
        z: 17921
    },
    PRELOADER_DELAY: 350,
    PRELOADER_FADE: 250
};

// Module-level state
let last_visited = 0;
let cells = null;  // Added module-level cells variable

// Initializes the 3D visualization scene for cell data exploration.
// Creates cell meshes using make_cells_2, adds them to the scene, sets up lighting,
// initializes mouse interactions, and prepares the tree control structure.
function initScene(cellData) {
    cells = make_cells_2(cellData);  // Assign to module-level variable
    viewer.scene.scene.add(cells.front_face.instancedMesh);
    
    iniLights();
    setupMouseInteraction();
    attach_tree_control(cellData);
    
    removePreloader();
    clearScreen();
}

// Sets up mouse movement tracking for cell interaction.
// Attaches an event listener to the renderer's DOM element with throttling
// to prevent performance issues from rapid mouse movements.
function setupMouseInteraction() {
    viewer.renderer.domElement.addEventListener('mousemove', 
        throttle(onMouseMove, CONSTANTS.MOUSE_THROTTLE_MS)
    );
}

// Processes mouse movements to detect and handle cell interactions.
// Uses raycasting to find intersections with cells, then delegates to appropriate
// handlers based on intersection distance and validity.
function onMouseMove(event) {
    const mouse = getMousePosition(event);
    const intersects = getRaycasterIntersects(mouse);
    
    if (!intersects.length) {
        handleNoIntersection();
        return;
    }
    
    const intersection = intersects[0];
    if (intersection.distance >= CONSTANTS.MAX_INTERSECTION_DISTANCE) {
        handleDistantIntersection();
        return;
    }
    
    handleValidIntersection(intersection);
}

// Converts screen mouse coordinates to WebGL-compatible normalized coordinates.
// Transforms clientX/Y coordinates to the -1 to 1 range needed for raycasting,
// accounting for the viewport dimensions.
function getMousePosition(event) {
    return {
        x: (event.clientX / viewer.renderer.domElement.clientWidth) * 2 - 1,
        y: -(event.clientY / viewer.renderer.domElement.clientHeight) * 2 + 1,
    };
}

// Detects which cells the mouse is pointing at in 3D space.
// Creates a raycaster, sets its position based on mouse and camera,
// then checks for intersections with the cell mesh.
function getRaycasterIntersects(mouse) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, scene.getActiveCamera());
    return raycaster.intersectObjects([cells.front_face.instancedMesh]);
}

// Handles when the mouse is too far from any cell.
// Resets the cursor style to default and clears all visualizations
// by calling clearScreen.
function handleDistantIntersection() {
    $('html,body').css('cursor', 'default');
    clearScreen();
}

// Updates visualization when mouse hovers over a valid cell.
// Checks if the cell is different from last visited, then cleans up
// previous visualizations and triggers new data loading for the current cell.
function handleValidIntersection(intersection) {
    const instanceId = cellData[intersection.instanceId];
    if (last_visited !== instanceId.label) {
        remove_lines();
        cellMouseHover(instanceId.label);
        last_visited = instanceId.label;
    }
}

// Creates hierarchical navigation structure for cell classifications.
// Extracts unique class names, builds a tree structure, and initializes
// the jsTree UI component with the resulting data.
function attach_tree_control(cellData) {
    const classNames = getUniqueClassNames(cellData);
    const treeData = tree(classNames);
    myjsTree(treeData);
}

// Extracts and sorts unique cell classification names.
// Maps over cell data to get top_class values, filters out negative values,
// creates a Set to remove duplicates, then sorts the results.
function getUniqueClassNames(cellData) {
    return [...new Set(
        cellData
            .map(d => d.top_class)
            .filter(d => d >= 0)
    )].sort();
}

// Utility functions
function throttle(callback, interval) {
    let enableCall = true;

    return function(...args) {
        if (!enableCall) return;

        enableCall = false;
        callback.apply(this, args);
        setTimeout(() => enableCall = true, interval);
    };
}

export function groupBy(array, key) {
    return array.reduce((result, currentValue) => {
        (result[currentValue[key]] = result[currentValue[key]] || [])
            .push(currentValue);
        return result;
    }, {});
}

// Cell hover handling
function cellMouseHover(label) {
    console.log('Hovering over cell: ' + label);
    d3.queue()
        .defer(d3.json, `https://storage.googleapis.com/merfish_data/cellData/${label}.json`)
        .defer(d3.csv, "./py/merfish_colour_scheme.csv")
        .await(splitArgs(label));
}

function splitArgs(label) {
    return (err, ...args) => {
        if (err) {
            console.error('Error loading cell data:', err);
            return;
        }

        const [data, geneColors] = args;
        const targetCell = cellData.filter(d => d.label === label)[0];
        
        const lines = make_line(data, targetCell, geneColors);
        lines.forEach(line => viewer.scene.scene.add(line));
        
        const spots = groupBy(data, 'gene');
        showControls();
        renderDataTable(spots, targetCell);
        donutchart(targetCell);
    };
}

// Creates visualization lines for cell relationships.
// Flattens the input object into spots, assigns colors based on gene data,
// then maps each spot to a THREE.js line connecting it to the target cell.
function make_line(obj, targetCell, geneColors) {
    const spots = Object.values(obj).flat();
    spots.forEach(spot => {
        const color = get_color(spot.gene, geneColors);
        Object.assign(spot, color);
    });
    
    return spots.map(spot => make_line_helper(spot, targetCell));
}

function get_color(gene, geneColors) {
    const specs = geneColors.filter(d => d.gene === gene)[0];
    return specs ? {
        r: +specs.r,
        g: +specs.g,
        b: +specs.b
    } : {
        r: 0,
        g: 0,
        b: 0
    };
}

// Creates a single THREE.js line with proper memory management.
// Generates start and end points, creates geometry and material with
// appropriate colors, and adds a dispose method for cleanup.
function make_line_helper(spotData, targetCell) {
    const points = [
        new THREE.Vector3(spotData.x, spotData.y, spotData.z),
        new THREE.Vector3(targetCell.x, targetCell.y, targetCell.z)
    ];
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: new THREE.Color(
            spotData.r/CONSTANTS.COLOR_SCALE,
            spotData.g/CONSTANTS.COLOR_SCALE,
            spotData.b/CONSTANTS.COLOR_SCALE
        )
    });
    
    const line = new THREE.Line(geometry, material);
    line.name = targetCell.label;
    
    // Add cleanup method
    line.dispose = () => {
        geometry.dispose();
        material.dispose();
    };
    
    return line;
}

// Removes all visualization lines and frees associated memory.
// Filters scene children for Line objects, calls their dispose methods
// to clean up THREE.js resources, then removes them from the scene.
function remove_lines() {
    const scene = viewer.scene.scene;
    scene.children
        .filter(child => child.type === "Line")
        .forEach(line => {
            if (line.dispose) line.dispose();
            scene.remove(line);
        });
}

// Resets visualization state when mouse leaves a cell.
// Removes all visualization lines and resets the last_visited tracker to 0.
function handleNoIntersection() {
    remove_lines();
    last_visited = 0;
}

// Performs complete cleanup of the visualization.
// Removes all lines and hides any visible UI controls.
function clearScreen() {
    remove_lines();
    hideControls();
}

export default initScene;
