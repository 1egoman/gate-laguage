import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/monokai.css';
import 'codemirror/mode/jsx/jsx';
import 'codemirror/addon/mode/simple';

import './index.css';

import renderViewport from './render';

// import deepDiff from 'deep-diff';
import debounce from 'lodash.debounce';

import registerServiceWorker from './registerServiceWorker';
registerServiceWorker();



function createEditor(element) {
  // Define editor parameters
  CodeMirror.defineSimpleMode('bitlang', {
    // The start state contains the rules that are intially used
    start: [
      {regex: /(block)(\s+)([A-Za-z_][A-Za-z0-9_]*)/, token: ["keyword", null, "variable-2"]},
      {regex: /(let|return|block)\b/, token: "keyword"},
      {regex: /(?:1|0)/, token: "atom"},
      {regex: /\/\*/, token: "comment", next: "comment"},
      {regex: /\/\/[^\n]*/, token: "comment"},
      {regex: /(?:and|or|not)/, token: "property"},
      {regex: /[A-Za-z_][A-Za-z0-9_]*/, token: "variable-3"},
      {regex: /[{[(]/, indent: true},
      {regex: /[}\])]/, dedent: true},
    ],
    // The multi-line comment state.
    comment: [
      {regex: /.*?\*\//, token: "comment", next: "start"},
      {regex: /.*/, token: "comment"}
    ],
    meta: {
      dontIndentStates: ["comment"],
      lineComment: "//"
    },
  });

  // Create editor
  const editor = CodeMirror(element, {
    lineNumbers: true,
    value: `
let clk = momentary()
let q1 nq1 = tflipflop(clk)
led(nq1)
let q2 nq2 = tflipflop(q1)
led(nq2)
let q3 nq3 = tflipflop(q1 and q2)
led(nq3)
let q4 nq4 = tflipflop((q1 and q2) and q3)
led(nq4)
    `,
    mode: 'bitlang',
    theme: 'monokai',
  });
  editor.setSize('100%', '100%');

  return editor;
}
const editor = createEditor(document.getElementById('editor-parent'));


const compile = debounce(function compile(source) {
  return fetch('http://localhost:8080/v1', {
    method: 'POST',
    body: source,
    headers: {
      'Content-Type': 'text/plain',
      'Accept': 'application/json',
    },
  }).then(result => {
    if (result.ok) {
      return result.json();
    } else {
      throw new Error(`Compilation failed: ${result.statusCode}`);
    }
  }).then(newData => {
    // Was an error received while compiling?
    if (newData.Error) {
      throw new Error(newData.Error);
    }
    error = null;

    // Store data in global
    data = newData;
    data.Gates = data.Gates || []
    data.Wires = data.Wires || []
    data.Contexts = data.Contexts || []

    function getContext(id) {
      return data.Contexts.find(i => i.Id === id);
    }

    // Figure out all blocks that this gate network is made up of.
    const contextsSortedFromShallowestToDeepest = data.Contexts.sort((a, b) => a.Depth - b.Depth);

    // Position each block
    let rootContextX = 0, rootContextY = 0;
    contextsSortedFromShallowestToDeepest.forEach(context => {
      // Get parent and child contexts to the currently active context.
      const parent = getContext(context.Parent) || {};
      const childIndex = parent.Children ? parent.Children.findIndex(i => i === context.Id) : 0;
      const children = context.Children.map(getContext);

      context.x = (parent.x || rootContextX) + (context.Depth * (500 / 4)) + ((childIndex * 2) * 500)
      context.y = (parent.y || rootContextY) + (context.Depth * (500 / 4))
      context.width = 500 + (children.length * 500)
      context.height = 500 + (children.length * 500)

      // If in the root context, increment the position for hte next root block.
      if (!parent.x) {
        rootContextX += context.width;
        rootContextY += 0 //context.height;
      }

      console.log('X', context.x, 'Y', context.y);
      console.log('Width', context.width, 'Height', context.height);
    });

    let spacingByContext = {};
    data.Gates.forEach(gate => {
      // Calculate the width of this gate.
      let gateWidth = 40;
      if (gate.Type === 'BUILTIN_FUNCTION' && gate.Label === 'tflipflop') {
        gateWidth = 100;
      }

      const context = getContext(gate.CallingContext);
      if (context) {
        if (context.gateCount) {
          if (gate.Type === 'BLOCK_INPUT' || gate.Type === 'BLOCK_OUTPUT') {
            // All inputs and outputs are on the top border.
            spacingByContext[context.Id] = (spacingByContext[context.Id] || 0) + gateWidth
            gate.xPosition = context.x + spacingByContext[context.Id]
            gate.yPosition = context.y
            context.gateCount += 1
          } else {
            // All the rest of the gates in a line below the inputs and outputs
            spacingByContext[context.Id] = (spacingByContext[context.Id] || 0) + gateWidth
            gate.xPosition = context.x + spacingByContext[context.Id]
            gate.yPosition = context.y + 100
            context.gateCount += 1
          }
        } else {
          // Position the first gate in the lower right corner
          gate.xPosition = context.x
          gate.yPosition = context.y
          context.gateCount = 1
        }
      } else {
        // All the rest of the gates in a line below the inputs and outputs
        spacingByContext[null] = (spacingByContext[null] || 0) + gateWidth
        gate.xPosition = spacingByContext[null];
        gate.yPosition = 0
      }
    });

    // Move gates closer to their inputs and outputs
    data.Gates.forEach(gate => {
      if (gate.Inputs.length === 0 || gate.Type === 'BLOCK_INPUT' || gate.Type === 'BLOCK_OUTPUT') {
        return;
      }

      const gateConnectedToInput = data.Gates.find(g => {
        return g.Outputs.map(k => k.Id).indexOf(gate.Inputs[0].Id) !== -1;
      });

      const wireLength = Math.sqrt(
        Math.pow(gateConnectedToInput.xPosition - gate.xPosition, 2),
        Math.pow(gateConnectedToInput.yPosition - gate.yPosition, 2),
      );

      if (wireLength > 300) {
        gate.xPosition = gateConnectedToInput.xPosition;
        gate.yPosition = gateConnectedToInput.yPosition - 100;
      }
    });

    renderFrame(data.Gates.map(i => i.Id));
  }).catch(err => {
    console.error(err.stack);
    // Set a global error variable
    error = err.message;
  });
}, 1000);

Object.defineProperty(window, 'gates', {
  get: function() {
    return data.Gates;
  },
  set: function(value) {
    data.Gates = value;
    renderFrame(data.Gates.map(i => i.Id));
  },
})



let data = {Gates: [], Wires: [], Outputs: []};
let error = null;
editor.on('change', () => {
  const value = editor.getValue();
  compile(value);
});
compile(editor.getValue());

// Get a reference to the svg viewport
const viewport = document.getElementById('viewport');
const updateViewport = renderViewport(viewport);

// Update the powered state of any wires and redraw the viewport.
let gateState = null;
function renderFrame(updatedGateIds) {
  data.Gates = data.Gates || []
  data.Wires = data.Wires || []
  data.Outputs = data.Outputs || []

  function setWire(id, powered) {
    const wire = data.Wires.find(i => i.Id === id);
    if (wire) {
      wire.powered = powered;

      if (updatedWireIds.indexOf(id) === -1) {
        updatedWireIds.push(id);
      }
    }
  }

  function getWire(id) {
    const wire = data.Wires.find(i => i.Id === id);
    if (wire) {
      return wire.powered;
    }
  }

  // Update the powered state of the wires.
  const updatedWireIds = [];

  // Calculate a hash of the current gate's state
  const newGateState = JSON.stringify(
    data.Gates.filter(i => i.Type === 'BUILTIN_FUNCTION' && ['toggle', 'momentary'].indexOf(i.Label) !== -1)
      .map(i => [i.id, i.state])
      .sort((a, b) => b[0] - a[0])
      .map(i => i[1])
  ) + data.Gates.length.toString();

  // If the hash doesn't match the previous hash that was stored, recalculate the stat of all gates.
  if (gateState !== newGateState) {
    gateState = newGateState;

    const loopCount = 150 + Math.floor(Math.random() * 5);
    for (let i = 0; i < loopCount; i++) {
      // Update wire state.
      data.Gates.forEach(gate => {
        switch (gate.Type) {
          case 'AND':
            setWire(gate.Outputs[0].Id, getWire(gate.Inputs[0].Id) && getWire(gate.Inputs[1].Id));
            break;
          case 'OR':
            setWire(gate.Outputs[0].Id, getWire(gate.Inputs[0].Id) || getWire(gate.Inputs[1].Id));
            break;
          case 'NOT':
            setWire(gate.Outputs[0].Id, !getWire(gate.Inputs[0].Id));
            break;

          case 'BLOCK_INPUT':
          case 'BLOCK_OUTPUT':
            setWire(gate.Outputs[0].Id, getWire(gate.Inputs[0].Id));
            break;

          case 'SOURCE':
            setWire(gate.Outputs[0].Id, true);
            break;
          case 'GROUND':
            setWire(gate.Outputs[0].Id, false);
            break;

          case 'BUILTIN_FUNCTION':
            if (['momentary', 'toggle'].indexOf(gate.Label) >= 0) {
              for (let i = 0; i < gate.Outputs.length; i++) {
                setWire(gate.Outputs[i].Id, gate.state === 'on');
              }
            } else if (['led'].indexOf(gate.Label) >= 0) {
              if (getWire(gate.Inputs[0].Id) === true) {
                gate.state = 'on';
              } else {
                gate.state = 'off';
              }
            } else if (['tflipflop'].indexOf(gate.Label) >= 0) {
              const powered = getWire(gate.Inputs[0].Id);
              let r = false, s = false;
              if (gate.Inputs.length > 1) {
                s = getWire(gate.Inputs[1].Id);
              }
              if (gate.Inputs.length > 2) {
                r = getWire(gate.Inputs[2].Id);
              }

              // If power was received and the state wasn't already flipped, do this now.
              if (powered && !gate._poweredflag) {
                gate._poweredflag = true;
                gate.state = gate.state === 'on' ? 'off' : 'on';
              } else if (!powered) {
                gate._poweredflag = false
              }

              if (r) {
                gate.state = 'off';
              }
              if (s) {
                gate.state = 'on';
              }

              if (gate.state === 'on') {
                setWire(gate.Outputs[0].Id, true);
                if (gate.Outputs.length > 1) { /* set not q if passed */
                  setWire(gate.Outputs[1].Id, false);
                }
              } else {
                setWire(gate.Outputs[0].Id, false);
                if (gate.Outputs.length > 1) { /* set not q if passed */
                  setWire(gate.Outputs[1].Id, true);
                }
              }
            }
            break;

          default:
            break;
        }
      });
    }
  }

  // Rerender the viewport.
  updateViewport(data, error, {viewboxX, viewboxY, renderFrame});
}

// Initial frame render.
renderFrame(data.Gates.map(i => i.Id));






function save() {
  const output = `${editor.getValue()}\n---\n${JSON.stringify(data)}`;

  const filename = prompt('Filename?');

  const blob = new Blob([output], {type: 'text/plain'});
  const url = URL.createObjectURL(blob);

  const tempLink = document.createElement('a');
  document.body.appendChild(tempLink);
  tempLink.setAttribute('href', url);
  tempLink.setAttribute('download', `${filename}.bit.json`);
  tempLink.click();
}
window.save = save;







let viewboxX = 0;
let viewboxY = 0;
let viewboxZoom = 1;


// Allow the user to change the zoom level of the viewbox by moving the slider.
const zoomSlider = document.getElementById('zoom-slider');
function zoomViewbox() {
  viewboxZoom = zoomSlider.value / 100;
  resizePanes(resizePosition);
}

zoomSlider.addEventListener('change', zoomViewbox);
zoomSlider.addEventListener('input', zoomViewbox);


// Adjust the position of the viewbox when the user drags around the svg canvas.
let moveOnSvg = false;
viewport.addEventListener('mousedown', event => {
  moveOnSvg = event.target.getAttribute('id') === 'viewport' ||
    event.target.getAttribute('id') === 'block' ||
    event.target.getAttribute('id') === 'wire';

  if (moveOnSvg) { // Deselect all gates if clicking on the viewport background or a block.
    data.Gates.forEach(i => {
      i.active = false;
    });
    renderFrame([]);
  }
});
viewport.addEventListener('mousemove', event => {
  let selected = data.Gates.filter(i => i.active === true);
  if (event.buttons > 0 && moveOnSvg) {
    viewboxX -= viewboxZoom * event.movementX;
    viewboxY -= viewboxZoom * event.movementY;
    resizePanes(resizePosition);
  } else if (event.buttons > 0 && selected.length > 0) {
    selected.forEach(s => {
      s.xPosition = (s.xPosition || 0) + viewboxZoom * event.movementX;
      s.yPosition = (s.yPosition || 0) + viewboxZoom * event.movementY;
    });
    renderFrame([]);
  }
});


// Handle resizing of editor/viewport split.
const RESIZE_BAR_WIDTH = 50;
const resizeBar = document.getElementById('resize-bar');
let resizePosition = resizeBar.offsetLeft + (RESIZE_BAR_WIDTH / 2);

function resizePanes(resizePosition) {
  document.getElementById('editor-parent').style.width = `${resizePosition - (RESIZE_BAR_WIDTH / 2)}px`;
  viewport.setAttribute('width', `${document.body.clientWidth - resizePosition - (RESIZE_BAR_WIDTH / 2)}px`);
  viewport.setAttribute('height', `${document.body.clientHeight}px`);

  // If a viewbox has not been set, set it to `0 0 width height` (filling up the whole svg.)
  // Otherwise, adjust the viewbox width and height but keep the x and y coordinates the same.
  viewport.setAttribute('viewBox', `${viewboxX} ${viewboxY} ${viewboxZoom * viewport.clientWidth} ${viewboxZoom * viewport.clientHeight}`);

  // Rerender the viewport
  renderFrame([]);
}

resizeBar.addEventListener('mousemove', function(event) {
  if (event.buttons > 0) {
    resizePosition = event.screenX;
    resizePanes(resizePosition);
  }
});

// Initial svg size
resizePanes(resizePosition);
