/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-expression-editor.js) provides the GUI
functionality for the Linny-R Expression Editor dialog.

*/

/*
Copyright (c) 2017-2023 Delft University of Technology

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// CLASS ExpressionEditor
class ExpressionEditor {
  constructor() {
    this.dataset_dot_option = '. (this dataset)';
    this.edited_input_id = '';
    this.edited_expression = null;
    // Dialog DOM elements
    this.property = document.getElementById('expression-property');
    this.text = document.getElementById('expression-text');
    this.status = document.getElementById('expression-status');
    this.info = document.getElementById('expression-info');
    // The DOM elements for the "insert variable" bar
    this.obj = document.getElementById('variable-obj');
    this.name = document.getElementById('variable-name');
    this.attr = document.getElementById('variable-attr');
    // The quick guide to Linny-R expressions
    this.info.innerHTML = `
<h3>Linny-R expressions</h3>
<p><em>NOTE: Move cursor over a</em> <code>symbol</code>
  <em>for explanation.</em>
<p>
<h4>Variables</h4>
<p>
  Attributes of <em
  title="i.e., processes, products, links, clusters, actors and datasets"
  >entities</em> are enclosed by brackets, with a vertical bar between
  entity name and <em>property selector</em>, e.g.,
  <code title="NOTE: Entity names are not sensitive to case or spacing.
Attributes, however, are case sensitive!">[Actor X|CF]</code> for cash flow.
  Solver properties
  (<code title="Absolute time step (starts at t&#8320;)">t</code>,
  <code title="Relative time step (t &minus; t&#8320; + 1)">rt</code>,
  <code title="Number of current block">b</code>,
  <code title="Time step within current block">bt</code>,
  <code title="Duration of 1 time step (in hours)">dt</code>,
  <code title="Run length (# time steps)">N</code>,
  <code title="Block length (# time steps)">n</code>,
  <code title="Look-ahead (# time steps)">l</code>,
  <code title="Number of current round (1=a, 2=b, etc.)">r</code>,
  <code title="Number of last round in the sequence (1=a, 2=b, etc.)">lr</code>,
  <code title="Number of rounds in the sequence">nr</code>,
  <code title="Number of current experiment run (starts at 0)">x</code>,
  <code title="Number of runs in the experiment">nx</code>,
  <span title="Index variables of iterator dimensions)">
    <code>i</code>, <code>j</code>, <code>k</code>,
  </span>
  <code title="Number of time steps in 1 year)">yr</code>,
  <code title="Number of time steps in 1 week)">wk</code>,
  <code title="Number of time steps in 1 day)">d</code>,
  <code title="Number of time steps in 1 hour)">h</code>,
  <code title="Number of time steps in 1 minute)">m</code>,
  <code title="Number of time steps in 1 second)">s</code>,
  <code title="A random number from the uniform distribution U(0, 1)">random</code>),
  constants (<code title="Mathematical constant &pi; = ${Math.PI}">pi</code>,
  <code title="Logical constant true = 1
NOTE: any non-zero value evaluates as true">true</code>,
  <code title="Logical constant false = 0">false</code>,
  <code title="The value used for &lsquo;unbounded&rsquo; variables (` +
    VM.PLUS_INFINITY.toExponential() + `)">infinity</code>) and scale units
    are <strong><em>not</em></strong> enclosed by brackets. Scale units
    may be enclosed by single quotes.
</p>
<h4>Operators</h4>
<p><em>Monadic:</em>
  <code title="-X evaluates as minus X">-</code>, 
  <code title="not X evaluates as 1 if X equals 0 (otherwise 0)">not</code>,
  <code title="abs X evaluates as the absolute value of X">abs</code>,
  <code title="int X evaluates as the integer part of X">int</code>,
  <code title="fract X evaluates as the decimal fraction of X">fract</code>,
  <code title="round X evaluates as X rounded to the nearest integer">round</code>,
  <code title="sqrt X evaluates as the square root of X">sqrt</code>,
  <code title="ln X evaluates as the natural logarithm of X">ln</code>,
  <code title="exp X evaluates as \u{1D452} raised to the power of X">exp</code>,
  <code title="sin X evaluates as the sine of X">sin</code>,
  <code title="cos X evaluates as the cosine of X">cos</code>,
  <code title="atan X evaluates as the inverse tangent of X">atan</code>,
  <code title="binomial X evaluates as a random number from the Binomial(N, p) distribution">binomial</code>,
  <code title="exponential X evaluates as a random number from the Exponential(&lambda;) distribution">exponential</code>,
  <code title="normal(X;Y) evaluates as a random number from the Normal(&mu;,&sigma;) distribution">normal</code>,
  <code title="poisson(X) evaluates as a random number from the Poisson(&lambda;) distribution">poisson</code>,
  <code title="triangular(X;Y;Z) evaluates as a random number from the Triangular(a,b,c) distribution
NOTE: When omitted, the third parameter c defaults to (a+b)/2">triangular</code>,
  <code title="weibull(X;Y) evaluates as a random number from the Weibull(&lambda;,k) distribution">weibull</code>,
  <code title="max(X1;&hellip;;Xn) evaluates as the highest value of X1, &hellip;, Xn">max</code>,
  <code title="min(X1;&hellip;;Xn) evaluates as the lowest value of X1, &hellip;, Xn">min</code>,
  <code title="npv(R;N;CF) evaluates as the net present value of a constant cash flow of CF
for a period of N time steps with a discount rate R, i.e., &Sigma; CF/(1+r)\u2071 for i=0, &hellip;, N-1.
NOTE: When the grouping contains more than 3 arguments, npv(R;X0;&hellip;;Xn)
considers X0, &hellip;, Xn as a variable cash flow time series.">npv</code><br>

  <em>Arithmetic:</em>
  <code title="X + Y = sum of X and Y">+</code>,
  <code title="X &minus; Y = difference between X and Y">-</code>,
  <code title="X * Y = product of X and Y">*</code>,
  <code title="X / Y = division of X by Y">/</code>,
  <code title="X % Y = the remainder of X divided by Y">%</code>,
  <code title="X ^ Y = X raised to the power of Y">^</code>,
  <code title="X log Y = base X logarithm of Y">log</code><br>

  <em>Comparison:</em>
  <code title="X = Y evaluates as 1 if X equals Y (otherwise 0)">=</code>,
  <code title="X &lt;&gt; Y evaluates as 1 if X does NOT equal Y (otherwise 0)">&lt;&gt;</code>
  or <code title="Alternative notation for X &lt;&gt; Y">!=</code>, 
  <code title="X &lt; Y evaluates as 1 if X is less than Y (otherwise 0)">&lt;</code>, 
  <code title="X &lt;= Y evaluates as 1 if X is less than or equal to Y (otherwise 0)">&lt;=</code>, 
  <code title="X &gt;= Y evaluates as 1 if X is greater than or equal to Y (otherwise 0)">&gt;=</code>, 
  <code title="X &gt; Y evaluates as 1 if X is greater than Y (otherwise 0)">&gt;</code><br> 

  <em>Logical:</em>
  <code title="X and Y evaluates as 1 if X and Y are both non-zero (otherwise 0)">and</code>, 
  <code title="X or Y evaluates as 1 unless X and Y are both zero (otherwise 0)">or</code><br>

  <em>Conditional:</em>
  <code title="X ? Y : Z evaluates as Y if X is non-zero, and otherwise as Z">X ? Y : Z</code>
  (can be read as <strong>if</strong> X <strong>then</strong> Y <strong>else</strong> Z)<br>

  <em>Resolving undefined values:</em>
  <code title="X | Y evaluates as Y if X is undefined, and otherwise as X">X | Y</code>
  (can be read as <strong>if</strong> X = &#x2047; <strong>then</strong> Y <strong>else</strong> X)<br>

  <em>Grouping:</em>
  <code title="X ; Y evaluates as a group or &ldquo;tuple&rdquo; (X, Y)
NOTE: Grouping groups results in a single group, e.g., (1;2);(3;4;5) evaluates as (1;2;3;4;5)">X ; Y</code>
  (use only in combination with <code>max</code>, <code>min</code>, <code>npv</code>
  and probabilistic operators)<br>
</p>
<p>
  Monadic operators take precedence over dyadic operators.
  Use parentheses to override the default evaluation precedence.
</p>`;
    // Add listeners to the GUI elements
    const md = UI.modals.expression;
    md.ok.addEventListener('click', () => X_EDIT.parseExpression());
    md.cancel.addEventListener('click', () => X_EDIT.cancel());
    // NOTE: this modal also has an information button in its header
    md.info.addEventListener(
        'click', () => X_EDIT.toggleExpressionInfo());
    document.getElementById('variable-obj').addEventListener(
        'change', () => X_EDIT.updateVariableBar());
    document.getElementById('variable-name').addEventListener(
        'change', () => X_EDIT.updateAttributeSelector());
    document.getElementById('variable-insert').addEventListener(
        'click', () => X_EDIT.insertVariable());
  }

  editExpression(event) {
    // Infers which entity property expression is to edited from the button
    // that was clicked, and then opens the dialog
    const
        btn = event.target,
        ids = btn.id.split('-'), // 3-tuple [entity type, attribute, 'x']
        prop = btn.title.substring(20); // trim "Edit expression for "
    if(ids[0] === 'note') {
      UI.edited_object = UI.dbl_clicked_node;
      this.edited_input_id = 'note-C';
      if(UI.edited_object) {
        this.edited_expression = UI.edited_object.color;
      } else {
        this.edited_expression = null;
      }
    } else {
      let n = '',
          a = '';
      if(ids[0] === 'link') {
        n = document.getElementById('link-from-name').innerHTML + UI.LINK_ARROW +
            document.getElementById('link-to-name').innerHTML;
      } else {
        n = document.getElementById(ids[0] + '-name').value;
        if(ids[0] === 'process') {
          a = document.getElementById('process-actor').value.trim();
        }
      }
      if(a) n += ` (${a})`;
      UI.edited_object = MODEL.objectByName(n);
      this.edited_input_id = UI.edited_object.type.toLowerCase() + '-' + ids[1];
      this.edited_expression = UI.edited_object.attributeExpression(ids[1]);
    }
    const md = UI.modals.expression;
    md.element('property').innerHTML = prop;
    md.element('text').value = document.getElementById(
        this.edited_input_id).value.trim();
    document.getElementById('variable-obj').value = 0;
    this.updateVariableBar();
    this.clearStatusBar();
    md.show('text');
  }
 
  cancel() {
    // Closes the expression editor dialog
    UI.modals.expression.hide();
    // Clear the "shortcut flag" that may be set by Shift-clicking the
    // "add chart variable" button in the chart dialog 
    EQUATION_MANAGER.add_to_chart = false;
  }
  
  parseExpression() {
    // Parses the contents of the expression editor
    let xt = this.text.value;
    // NOTE: the Insert button is quite close to the OK button, and often
    // the modeler clicks OK before Insert, leaving the expression empty;
    // hence assume that modeler meant to insert a variable if text is empty,
    // but all three variable components have been selected
    if(xt === '') {
      const
          n = this.name.options[this.name.selectedIndex].innerHTML,
          a = this.attr.options[this.attr.selectedIndex].innerHTML;
      if(n && a) xt = `[${n}${UI.OA_SEPARATOR}${a}]`;
    }
    // NOTE: If the expression is a dataset modifier or an equation, pass
    // the dataset and the selector as extra parameters for the parser 
    let own = null,
        sel = '';
    if(!this.edited_input_id && DATASET_MANAGER.edited_expression) {
      own = DATASET_MANAGER.selected_dataset;
      sel = DATASET_MANAGER.selected_modifier.selector;
    } else if(!this.edited_input_id && EQUATION_MANAGER.edited_expression) {
      own = MODEL.equations_dataset;
      sel = EQUATION_MANAGER.selected_modifier.selector;
    } else {
      own = UI.edited_object;
      sel = this.edited_input_id.split('-').pop();
    }
    const xp = new ExpressionParser(xt, own, sel);
    if(xp.error) {
      this.status.innerHTML = xp.error;
      this.status.style.backgroundColor = 'Yellow';
      SOUNDS.warning.play();
      this.text.focus();
      this.text.selectionStart = xp.pit - xp.los;
      this.text.selectionEnd = xp.pit;
      return false;
    } else {
      if(this.edited_input_id) {
        document.getElementById(this.edited_input_id).value = xp.expr;
        // NOTE: entity properties must be exogenous parameters
        const eo = UI.edited_object; 
        if(eo && xp.is_level_based &&
            !(eo instanceof Dataset || eo instanceof Note)) {
          UI.warn(['Expression for', this.property.innerHTML,
              'of<strong>', eo.displayName,
              '</strong>contains a solution-dependent variable'].join(' '));
        }
        this.edited_input_id = '';
      } else if(DATASET_MANAGER.edited_expression) {
        DATASET_MANAGER.modifyExpression(xp.expr);
      } else if(EQUATION_MANAGER.edited_expression) {
        EQUATION_MANAGER.modifyEquation(xp.expr);
      }
      UI.modals.expression.hide();
      return true;
    }
  }
  
  clearStatusBar() {
    this.status.style.backgroundColor = UI.color.dialog_background;
    this.status.innerHTML = '&nbsp;';
  }
  
  namesByType(type) {
    // Returns a list of entity names of the specified types
    // (used only to generate the options of SELECT elements)
    // NOTE: When editing a dataset modifier expression, start the list of
    // datasets with the edited dataset (denoted by a dot) while omitting the
    // name of that dataset from the list
    let e,
        l = MODEL.setByType(type),
        n = [],
        dsn = null;
    if(type === 'Dataset' && DATASET_MANAGER.edited_expression) {
      dsn = DATASET_MANAGER.selected_dataset.name;
    }
    if(dsn) n.push(this.dot_option);
    for(e in l) if(l.hasOwnProperty(e) && e !== dsn &&
        // NOTE: do not display the equations dataset or "black-boxed" datasets
        !(e === UI.EQUATIONS_DATASET_ID || e.startsWith(UI.BLACK_BOX))) {
      n.push(l[e].displayName);
    }
    return n;
  }  
  
  updateVariableBar(prefix='') {
    // NOTE: this method is also called by the add-variable dialog of the
    // Chart Manager AND of the Sensitivity Analysis; in these cases, `prefix`
    // is passed to differentiate between the DOM elements to be used
    const
        type = document.getElementById(prefix + 'variable-obj').value,
        n_list = this.namesByType(VM.object_types[type]).sort(
            (a, b) => UI.compareFullNames(a, b)),
        vn = document.getElementById(prefix + 'variable-name'),
        options = [];
    // Add "empty" as first and initial option, but disable it.
    options.push('<option selected disabled value="-1"></option>');
    if(VM.object_types[type] === 'Equation') {
      // Hide the variable name, as this is the Equations Dataset
      vn.style.display = 'none';
    } else {
      for(let i = 0; i < n_list.length; i++) {
        // NOTE: no "dot option" when adding a chart variable or SA variable
        if(!(prefix && n_list[i] === this.dataset_dot_option)) {
          options.push(`<option value="${i}">${n_list[i]}</option>`);
        }
      }
      vn.innerHTML = options.join('');
      vn.value = -1;
      vn.style.display = 'inline-block';
    }
    this.updateAttributeSelector(prefix);
  }
  
  updateAttributeSelector(prefix='') {
    // Updates the attribute list -- only if a dataset has been selected.
    // NOTE: this method is also called by the add-variable dialog of the
    // Chart Manager AND of the Sensitivity Analysis; in these cases, `prefix`
    // is passed to differentiate between the DOM elements to be used
    const
        type = document.getElementById(prefix + 'variable-obj').value,
        vn = document.getElementById(prefix + 'variable-name'),
        va = document.getElementById(prefix + 'variable-attr'),
        options = [];
    if(VM.object_types[type] === 'Equation') {
      // Add "empty" as first and initial option, but disable it
      options.push('<option selected disabled value="-1"></option>');
      const d = MODEL.equations_dataset;
      if(d) {
        const slist = [];
        for(let m in d.modifiers) if(d.modifiers.hasOwnProperty(m)) {
          slist.push(d.modifiers[m].selector);
        }
        // Sort to present equations in alphabetical order
        slist.sort((a, b) => UI.compareFullNames(a, b));
        for(let i = 0; i < slist.length; i++) {
          options.push(`<option value="${slist[i]}">${slist[i]}</option>`);
        }
      }
      va.innerHTML = options.join('');
      // NOTE: Chart Manager variable dialog is 60px wider
      va.style.width = (prefix ? 'calc(100% - 82px)' : 'calc(100% - 142px)');
      return;
    }
    // Add "empty" as first and initial option, as it denotes "use default"
    va.style.width = '65px';
    options.push('<option value="-1" selected></option>');
    if(VM.object_types[type] === 'Dataset') {
      let d = null,
          v = vn.options[vn.selectedIndex].innerHTML;
      if(v === this.dataset_dot_option) {
        d = DATASET_MANAGER.selected_dataset;
      } else if(v) {
        d = MODEL.datasetByID(UI.nameToID(v));
      }
      if(d) {
        for(let m in d.modifiers) if(d.modifiers.hasOwnProperty(m)) {
          const s = d.modifiers[m].selector;
          options.push(`<option value="${s}">${s}</option>`);
        }
      }
    } else {
      const
          vt = document.getElementById('add-sa-variable-type'),
          a_list = VM.type_attributes[type];
      for(let i = 0; i < a_list.length; i++) {
        const att = a_list[i];
        // NOTE: for SA parameters, only show expression attributes
        if(!vt || vt.innerHTML !== 'parameter' ||
            VM.expression_attr.indexOf(att) >= 0) {
          options.push('<option value="', i,  '" title="',
            VM.attribute_names[att], '">', att, '</option>');
        }
      }
    }
    va.innerHTML = options.join('');      
  }
  
  insertVariable() {
    const type = this.obj.value;
    let n = this.name.options[this.name.selectedIndex].text,
        a = this.attr.options[this.attr.selectedIndex].text;
    if(VM.object_types[type] === 'Equation') {
      n = a;
      a = '';
    }
    if(n) {
      if(n === this.dataset_dot_option) n = '.';
      if(a) n += UI.OA_SEPARATOR + a;
      let p = this.text.selectionStart;
      const
          v = this.text.value,
          tb = v.substring(0, p),
          ta = v.substring(p, v.length);
      this.text.value = `${tb}[${n}]${ta}`;
      p += n.length + 2;
      this.text.setSelectionRange(p, p);
    }
    this.text.focus();
  }
  
  toggleExpressionInfo() {
    // Show/hide information pane with information on expression notation,
    // meanwhile changing the dialog buttons: when guide is showing, only
    // display a "close" button, otherwise info, OK and cancel
    const md = UI.modals.expression;
    if(window.getComputedStyle(this.info).display !== 'none') {
      this.info.style.display = 'none';
      md.ok.style.display = 'block';
      md.cancel.style.display = 'block';
      md.info.src = 'images/info.png';
    } else {
      this.info.style.display = 'block';
      md.ok.style.display = 'none';
      md.cancel.style.display = 'none';
      md.info.src = 'images/close.png';
    }
  }
  
} // END of class ExpressionEditor
