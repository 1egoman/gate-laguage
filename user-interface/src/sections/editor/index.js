import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/monokai.css';
import 'codemirror/mode/jsx/jsx';
import 'codemirror/addon/mode/simple';

import debounce from 'lodash.debounce';

import compile from '../../helpers/compile/index';

// Define syntax highliughting parameters
CodeMirror.defineSimpleMode('bitlang', {
  // The start state contains the rules that are intially used
  start: [
    {regex: /(block)(\s+)([A-Za-z_][A-Za-z0-9_]*)/, token: ["keyword", null, "variable-2"]},
    {regex: /(let|return|block)\b/, token: "keyword"},
    {regex: /(?:1|0)/, token: "atom"},
    {regex: /\/\*/, token: "comment", next: "comment"},
    {regex: /\/\/[^\n]*/, token: "comment"},
    {regex: /(?:and|or|not|import)/, token: "property"},
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

// Create codemirror editor wrapping the passed-in element.
export function createEditor(element) {
  const editor = CodeMirror(element, {
    lineNumbers: true,
    value: localStorage.source,
    mode: 'bitlang',
    theme: 'monokai',
  });
  editor.setSize('100%', '100%');

  return editor;
}

export default async function initializeEditor(element, renderFrame, server) {
  const editor = createEditor(element);

  // Render editor contents at maximum once a second.
  const debouncedCompile = debounce(async (server, value) => {
    document.getElementById('viewport-refreshing').style.display = 'block';
    let data = {};
    try {
      // Attempt to compile the source code.
      data = await compile(server, value);
      renderFrame(data, null, data.Gates.map(i => i.Id));

      localStorage.source = value;

      setTimeout(() => {
        document.getElementById('viewport-refreshing').style.display = 'none';
        document.getElementById('viewport-refreshing-success').style.display = 'block';
        document.getElementById('viewport-refreshing-error').style.display = 'none';
      }, 100);
    } catch (err) {
      // An error occurred within compliation!
      renderFrame({}, err, []);

      document.getElementById('viewport-refreshing').style.display = 'block';
      document.getElementById('viewport-refreshing-success').style.display = 'none';
      document.getElementById('viewport-refreshing-error').style.display = 'block';
    }
  }, 1000);

  // When the user types in the editor, compile the source that they type and render it in the right
  // pane.
  editor.on('change', () => {
    const value = editor.getValue();
    debouncedCompile(server, value);
  });

  const data = await compile(server, editor.getValue());
  renderFrame(data, null, data.Gates.map(i => i.Id));
}
