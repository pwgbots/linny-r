/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-vm.js) defines the classes and functions that
implement the arithmetical expressions for entity attributes, and the Virtual
Machine (VM) that translates a Linny-R model into VM instructions that, when
executed by the VM, construct the Simplex tableau that can be sent to the
MILP solver.
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

// CLASS Expression (for all potentially time-dependent model parameters)
class Expression {
  constructor(obj, attr, text) {
    // Expressions are typically defined for some attribute of some
    // entity -- legacy convention is to refer to a model entity
    // as `object` rather than `entity`.
    this.object = obj;
    this.attribute = attr;
    this.text = text;
     // A stack for local time step (to allow lazy evaluation).
    this.step = [];
    // An operand stack for computation (elements must be numeric).
    this.stack = []; 
    // NOTE: code = NULL indicates: not compiled yet.
    this.code = null;
    // NOTE: Use a semaphore to prevent cyclic recursion.
    this.compiling = false;
    // While compiling, check whether any operand depends on time.
    this.is_static = true;
    // Likewise, check whether any operand is computed by the solver.
    this.is_level_based = false;
    // NOTE: VM expects result to be an array, even when expression is static.
    this.vector = [VM.NOT_COMPUTED];
    // For dataset *wildcard* modifier expressions, results are stored in a
    // separate vector for each wildcard number. The set of vectors expands
    // "lazily", as new entries (number: vector) are added only when the
    // expression is evaluated for a different wildcard number.
    // For all other expressions (typically properties of nodes), the
    // normal expression vector is used.
    // NOTE: Wildcard expressions merit special treatment when plotted in
    // a chart.
    this.wildcard_vectors = {};
    // NOTE: `wildcard_number` is used -- only during code execution --
    // by VMI_push_dataset_modifier (read and/or write) and by
    // VMI_push_contextual_number (read only). 
    this.wildcard_vector_index = false;
    // Special instructions can store results as cache properties to save
    // (re)computation time; cache is cleared when expression is reset.
    this.cache = {};
  }
  
  get isWildcardExpression() {
    // Returns TRUE if the owner is a dataset, and the attribute contains
    // wildcards.
    return this.object instanceof Dataset &&
        this.object.isWildcardSelector(this.attribute); 
  }
  
  get variableName() {
    // Return the name of the variable computed by this expression
    if(this.object === MODEL.equations_dataset) return 'equation ' + this.attribute;
    if(this.object) return this.object.displayName + UI.OA_SEPARATOR + this.attribute;
    return 'Unknown variable (no object)';
  }
  
  get timeStepDuration() {
    // Returns dt for dataset if this is a dataset modifier expression;
    // otherwise dt for the current model
    if(this.object instanceof Dataset) {
      return this.object.time_scale * VM.time_unit_values[this.object.time_unit];
    }
    return MODEL.timeStepDuration;
  }
  
  get referencedEntities() {
    // Returns a list of entities referenced in this expression.
    if(this.text.indexOf('[') < 0) return [];
    const
        el = [],
        ml = [...this.text.matchAll(/\[(\{[^\}]+\}){0,1}([^\]]+)\]/g)];
    for(let i = 0; i < ml.length; i++) {
      const n = ml[i][2].trim();
      let sep = n.lastIndexOf('|');
      if(sep < 0) sep = n.lastIndexOf('@');
      const
          en = (sep < 0 ? n : n.substring(0, sep)),
          e = MODEL.objectByName(en.trim());
      if(e) addDistinct(e, el);
    }
    return el;
  }
  
  update(parser) {
    // Must be called after successful compilation by the expression parser
    this.text = parser.expr;
    this.code = parser.code;
    // NOTE: overrule `is_static` to make that the "initial level" attribute
    // is always evaluated for t=1
    this.is_static = (this.attribute === 'IL' ? true : parser.is_static);
    this.is_level_based = parser.is_level_based;
    this.reset();
  }

  reset(default_value=VM.NOT_COMPUTED) {
    // Clears result of previous computation (if any)
    this.step.length = 0;
    this.stack.length = 0;
    this.wildcard_vectors = {};
    this.wildcard_vector_index = false;
    this.cache = {};
    this.compile(); // if(!this.compiled)  REMOVED to ensure correct isStatic!! 
    // Static expressions only need a vector with one element (having index 0)
    if(this.is_static) {
      // NOTE: empty expressions (i.e., no text) may default to different
      // values: typically 0 for lower bounds, infinite for upper process
      // bounds, etc., so this value must be passed as parameter
      this.vector.length = 1;
      if(this.text.length === 0) {
        this.vector[0] = default_value;
      } else {
        // Initial values must be computed *lazily* just like any other value 
        this.vector[0] = VM.NOT_COMPUTED;
      }
    } else if(this.object instanceof Dataset && this.object.array) {
      // For array-type dataset expressions, vector length should be array size,
      // rather than simulation run length
      this.vector.length = this.object.vector.length;
      this.vector.fill(VM.NOT_COMPUTED);
    } else {
      // An array of appropriate length initialized as "not computed"
      MODEL.cleanVector(this.vector, VM.NOT_COMPUTED);
    }
  }

  compile() {
    // Do not compile recursively.
    if(this.compiling) return;
    // Set the "compiling" flag to prevent cyclic recursion.
    this.compiling = true;
    // Clear the VM instruction list.
    this.code = null;
    const xp = new ExpressionParser(this.text, this.object, this.attribute);
    if(xp.error === '') {
      // NOTE: Except for dataset modifiers and note colors, expressions
      // should not be based on levels-still-to-be-computed-by-the-solver,
      // so caution the modeler when this appears to be the case.
      if(xp.is_level_based &&
          !(this.object instanceof Dataset || this.object instanceof Note)) {
        // NOTE: this should not occur, so log more details
        console.log('Level-based issue:',
            this.object, this.attribute, this.text);
        UI.warn(['Expression for', VM.attribute_names[this.attribute],
            'of<strong>', this.object.displayName,
            '</strong>contains a solution-dependent variable'].join(' '));
      }
      this.update(xp);
    } else {
      this.is_static = true;
      this.vector.length = 0;
      this.vector[0] = VM.INVALID;
      // Report error on-screen to modeler
      UI.alert(`Syntax error in ${this.variableName}: ${xp.error}`);
    }
    // Clear the "compiling" flag for this expression
    this.compiling = false;
  }

  get asXML() {
    // Returns XML-encoded expression after replacing "black-boxed" entities. 
    let text = this.text;
    if(MODEL.black_box) {
      // Get all entity names that occur in this expression
      const vl = text.match(/\[[^\[]+\]/g);
      if(vl) for(let i = 0; i < vl.length; i++) {
        // Trim enclosing brackets and remove the "tail" (attribute or offset) 
        let tail = '',
            e = vl[i].substring(1, vl[i].length - 1).split(UI.OA_SEPARATOR);
        if(e.length > 1) {
          tail = UI.OA_SEPARATOR + e.pop();
          e = e.join(UI.OA_SEPARATOR);
        } else {
          e = e[0].split('@');
          if(e.length > 1) {
            tail = '@' + e.pop();
            e = e.join('@');
          } else {
            e = e[0];
          }
        }
        // Link names comprise two entities; if so, process both
        e = e.split(UI.LINK_ARROW);
        const enl = [];
        let n = 0;
        for(let j = 0; j < e.length; j++) {
          const id = UI.nameToID(e[j]);
          if(MODEL.black_box_entities.hasOwnProperty(id)) {
            enl.push(MODEL.black_box_entities[id]);
            n++;
          } else {
            enl.push(e[j]);
          }
        }
        if(n > 0) {
          text = text.replace(vl[i], '[' + enl.join(UI.LINK_ARROW) + tail + ']');
        }
      }
    }
    return xmlEncoded(text);
  }
  
  get defined() {
    // Returns TRUE if the expression string is not empty.
    return this.text !== '';
  }
  
  get compiled() {
    // Returns TRUE if there is code for this expression.
    // NOTE: The expression parser sets `code` to NULL when compiling an
    // empty string. 
    return this.code !== null;
  }

  get isStatic() {
    // Returns is_static property AFTER compiling if not compiled yet.
    // NOTE: To prevent cylic recursion, return FALSE if this expression is
    // already being compiled.
    if(this.compiling) return false;
    if(!this.compiled) this.compile();
    return this.is_static;
  }
  
  trace(action) {
    // Adds step stack (if any) and action to the trace.
    if(DEBUGGING) {
      // Show the "time step stack" for --START and --STOP
      if(action.startsWith('--') || action.startsWith('"')) {
        const s = [];
        for(let i = 0; i < this.step.length; i++) {
          s.push(this.step[i]); 
        }
        action = `[${s.join(', ')}] ${action}`;
      }
      console.log(action);
    }
  }
  
  chooseVector(number) {
    // Return the vector to use for computation (defaults to "own" vector).
    // NOTE: Static wildcard expressions must also choose a vector!
    if(typeof number !== 'number' ||
       (this.isStatic && !this.isWildcardExpression)) return this.vector;
    // Use the vector for the wildcard number (create it if necessary).
    if(!this.wildcard_vectors.hasOwnProperty(number)) {
      this.wildcard_vectors[number] = [];
      if(this.isStatic) {
        this.wildcard_vectors[number][0] = VM.NOT_COMPUTED;
      } else {
        MODEL.cleanVector(this.wildcard_vectors[number], VM.NOT_COMPUTED);
      }
    }
    return this.wildcard_vectors[number];
  }
  
  compute(t, number=false) {
    // Executes the VM code for this expression for time step `t`.
    // NOTE: `number` is passed only if context for # is defined.
    if(!this.compiled) this.compile();
    // Return FALSE if compilation resulted in error.
    if(!this.compiled) return false;
    // Compute static expressions as if t = 0.
    if(t < 0 || this.isStatic) t = 0;
    // Select the vector to use.
    const v = this.chooseVector(number);
    // Check for potential error (that should NOT occur).
    if(!Array.isArray(v) || v.length === 0 || t >= v.length) {
      const msg = 'ERROR: Undefined value during expression evaluation';
      UI.alert(msg);
      console.log(this.variableName, ':', this.text, '#', number, '@', t, v);
      // Throw exception to permit viewing the function call stack.
      throw msg;
    }
    // When called while already computing for time step t, signal this
    // as an error value.
    if(v[t] === VM.COMPUTING) v[t] = VM.CYCLIC;
    // Compute a value only once.
    if(v[t] !== VM.NOT_COMPUTED) {
      if(DEBUGGING) console.log('Already computed', this.variableName,
          ':', this.text, '#', number, '@', t, v[t]);
      return true;
    }
    // Provide selector context for # (number = FALSE => no wildcard match).
    this.wildcard_vector_index = number;
    // Push this expression onto the call stack.
    VM.call_stack.push(this);
    // Push time step in case a VMI instruction for another expression
    // references this same variable.
    this.trace(`--START: ${this.variableName} (wvi = ${number})`);
    this.step.push(t);
    // NOTE: Trace expression AFTER pushing the time step.
    this.trace(`"${this.text}"`);
    v[t] = VM.COMPUTING;
    // Execute the instructions.
    let vmi = null,
        ok = true,
        cl = this.code.length;
    this.trace(pluralS(cl, 'VM instruction'));
    this.program_counter = 0;
    this.stack.length = 0;
    while(ok && this.program_counter < cl && v[t] === VM.COMPUTING) {
      vmi = this.code[this.program_counter];
      // Instructions are 2-element arrays [function, [arguments]].
      // The function is called with this expression as first parameter,
      // and the argument list as second parameter.
      vmi[0](this, vmi[1]);
      this.program_counter++;
    }
    // Stack should now have length 1.
    if(this.stack.length > 1) {
      v[t] = VM.OVERFLOW;
    } else if(this.stack.length < 1) {
      v[t] = VM.UNDERFLOW;
    } else {
      v[t] = this.stack.pop();
    }
    this.trace('RESULT = ' + VM.sig4Dig(v[t]));
    // Store wildcard result also in "normal" vector
    this.vector[t] = v[t];
    // Pop the time step.
    this.step.pop();
    this.trace('--STOP: ' + this.variableName);
    // Clear context for # for this expression (no stack needed, as
    // wildcard expressions cannot reference themselves).
    this.wildcard_vector_index = false;
    // If error, display the call stack (only once).
    // NOTE: "undefined", "not computed" and "still computing" are NOT
    // problematic unless they result in an error (stack over/underflow)
    if(v[t] <= VM.ERROR) {
      MONITOR.showCallStack(t);
      VM.logCallStack(t);
    }
    // Always pop the expression from the call stack.
    VM.call_stack.pop(this);
    return true;
  }

  result(t, number=false) {
    // Computes (only if needed) and then returns result for time step t
    // The `number` is passed only by the VMI_push_dataset_modifier
    // instruction so as to force recomputation of the expression
    // NOTE: for t < 1 return the value for t = 1, since expressions have no
    // "initial value" (these follow from the variables used in the expression)
    // Select the vector to use
    const v = this.chooseVector(number);
    if(!Array.isArray(v)) {
      console.log('ANOMALY: No vector for result(t)');
      return VM.UNDEFINED;
    }
    if(t < 0 || this.isStatic) t = 0;
    if(t >= v.length) return VM.UNDEFINED;
    if(v[t] === VM.NOT_COMPUTED || v[t] === VM.COMPUTING) {
      this.compute(t, number);
    }
    // NOTE: when this expression is the "active" parameter for sensitivity
    // analysis, the result is multiplied by 1 + delta %
    if(this === MODEL.active_sensitivity_parameter) {
      // NOTE: do NOT scale exceptional values
      if(v[t] > VM.MINUS_INFINITY && v[t] < VM.PLUS_INFINITY) {
        v[t] *= (1 + MODEL.sensitivity_delta * 0.01);
      }
    }
    return v[t];
  }

  get asAttribute() {
    // Returns the result for the current time step if the model has been solved
    // (special values as human-readable string), or the expression as text
    if(!(MODEL.solved || this.isStatic)) return this.text;
    const sv = VM.specialValue(this.result(MODEL.t))[1];
    // NOTE: ?? is replaced by empty string (undefined => empty cell in Excel)
    if(sv === '\u2047') return '';
    return sv;
  }
  
  push(value) {
    // Pushes a numeric value onto the computation stack
    if(this.stack.length >= VM.MAX_STACK) {
      this.trace('STACK OVERFLOW');
      this.stack.push(VM.OVERFLOW);
      this.computed = true;
      return false;
    }
    this.stack.push(value);
    return true;
  }
  
  top(no_check=false) {
    // Returns the top element of the stack, or FALSE if the stack was empty
    if(this.stack.length < 1) {
      this.trace('TOP: UNDERFLOW');
      this.stack = [VM.UNDERFLOW];
      this.computed = true;
      return false;
    }
    const top = this.stack[this.stack.length - 1]; 
    // Check for errors, "undefined", "not computed", and "still computing"
    if(top < VM.MINUS_INFINITY || top > VM.EXCEPTION) {
      // If error or exception, ignore UNDEFINED if `no_check` is TRUE)
      if(no_check && top <= VM.UNDEFINED) return top;
      // Otherwise, leave the special value on top of the stack, and
      // return FALSE so that the VM instruction will not alter it 
      this.trace(
          VM.errorMessage(top) + ' at top of stack: ' + this.stack.toString());
      return false;
    }
    return top;
  }

  pop(no_check=false) {
    // Returns the two top elements A and B as [A, B] after popping the top
    // element B from the stack, or FALSE if the stack contains fewer than 2
    // elements, or if A and/or B are error values
    if(this.stack.length < 2) {
      this.trace('POP: UNDERFLOW');
      this.stack.push(VM.UNDERFLOW);
      this.computed = true;
      return false;
    }
    // Get the top two numbers on the stack as a list
    const dyad = this.stack.slice(-2);
    // Pop only the top one
    this.stack.pop();
    // Check whether either number is an error code
    let check = Math.min(dyad[0], dyad[1]);
    if(check < VM.MINUS_INFINITY &&
        // Exception: "array index out of bounds" error may also be
        // ignored by using the | operator.
        !(no_check && check === VM.ARRAY_INDEX)) {
      // If error, leave the severest error on top of the stack
      this.retop(check);
      this.trace(VM.errorMessage(check) + ' in dyad: ' + dyad.toString());
      return false;
    }
    // Now check for "undefined", "not computed", and "still computing".
    check = dyad[0];
    if(no_check) {
      // For VMI_replace_undefined, ignore that A is "undefined" or even
      // "array index out of bounds" unless B is also "undefined".
      if(check === VM.UNDEFINED || check === VM.ARRAY_INDEX) {
        dyad[0] = VM.UNDEFINED; // Treat "out of bounds" as "undefined".
        check = dyad[1];
      }
    } else {
      check = Math.max(check, dyad[1]);
    }
    if(check > VM.EXCEPTION) {
      this.retop(check);
      this.trace(VM.errorMessage(check) + ' in dyad: ' + dyad.toString());
      return false;
    }
    // No problem(s)? Then return the dyad.
    return dyad;
  }

  retop(value) {
    // Replaces the top element of the stack by the new value
    // NOTE: does not check the stack length, as this instruction typically
    // follows a TOP or POP instruction
    this.stack[this.stack.length - 1] = value;
    return true;
  }
  
  replaceAttribute(re, a1, a2) {
    // Replaces occurrences of attribute `a1` by `a2` for all variables that
    // match the regular expression `re`
    let n = 0;
    const matches = this.text.match(re);
    if(matches) {
      // Match is case-insensitive, so check each for matching case of attribute
      for(let i = 0; i < matches.length; i++) {
        const
            m = matches[i],
            e = m.split('|');
        // Let `ao` be attribute + offset (if any) without right bracket
        let ao = e.pop().slice(0, -1),
            // Then also trim offset and spaces)
            a = ao.split('@')[0].trim();
        // Check if `a` (without bracket and without spaces) indeed matches `a1`
        if(a === a1) {
          // If so, append new attribute plus offset plus right bracket...
          e.push(ao.replace(a, a2) + ']');
          // ... and replace the original match by the ensemble
          this.text = this.text.replace(m, e.join('|'));
          n += 1;
        }
      }
    }
    return n;
  }

} // END of Expression class


// CLASS ExpressionParser
// Instances of ExpressionParser compile expressions into code, i.e.,
// an array of VM instructions. The optional parameters `owner` and
// `attribute` are used to prefix "local" entities, and also to implement
// modifier expressions that contain the "dot" that (when used within
// brackets) denotes the data value of the dataset.

// Since version 1.4.0, a leading colon indicates that the variable
// "inherits" the prefixes of its owner. Thus, for example, in the expression
// for the upper bound of proces "Storage: Li-ion: battery 1", the variable
// [:capacity] will be interpreted as [Storage: Li-ion: capacity].
// The prefixed name will be parsed normally, so if "Storage: Li-ion: capacity"
// identifies an array-type dataset, [:capacity@#] will work, since the
// value of # can be inferred from the expression owner's name
// "Storage: Li-ion: battery 1".

// Also since version 1.4.0, the context sensitive number # can also be used
// as a "wildcard" in an entity name. This is useful mainly when combined with
// wildcard equations with names like "eq??ion" which can then be referred to
// in expressions not only as "eq12ion" (then # in the expression for the
// wildcard equation evaluates as 12), but also as "eq#ion" (then # in the
// expression for the wildcard equation will have the value of # in the
// "calling" expression. This permits, for example, defining as single
// equation "partial load ??" with expression "[P#|L] / [P#|UB]", and then
// using the variable [partial load 1] to compute the partial load for
// process P1.
// NOTES:
// (1) This applies recursively, so [partial load #] can be used in some other
// wildcard equation like, for example, "percent load ??" having expression
// "100 * [partial load #]".
// (2) The # may be used in patterns, so when a model comprises processes
// P1 and P2, and products Q2 and Q3, and a wildcard equation "total level ??"
// with expression "[SUM$#|L]", then [total level 1] will evaluate as the level
// of P1, and [total level 2] as the level of P2 plus the level of Q3.

class ExpressionParser {
  constructor(text, owner=null, attribute='') {
    // Setting TRACE to TRUE will log parsing information to the console.
    this.TRACE = false;
    // `text` is the expression string to be parsed.
    this.expr = text;
    // NOTE: When expressions for dataset modifiers or equations are
    // parsed, `owner` is their dataset, and `attribute` is their name.
    this.owner = owner;
    this.owner_prefix = '';
    this.attribute = attribute;
    this.dataset = null;
    this.dot = null;
    this.selector = '';
    this.context_number =  '';
    this.wildcard_selector = false;
    // Always infer the value for the context-sensitive number #.
    // NOTE: This this will always be a string. Three possible cases:
    // (1) a question mark "?" if `owner` is a dataset and `attribute`
    //     wildcards in its selector; this indicates that the value of # cannot be inferred at
    //     compile time.
    // 
    if(owner) {
      this.context_number = owner.numberContext;
      // NOTE: The owner prefix includes the trailing colon+space.
      if(owner instanceof Link || owner instanceof Constraint) {
        // For links and constraints, use the longest prefix that
        // their nodes have in common.
        this.owner_prefix = UI.sharedPrefix(owner.from_node.displayName,
            owner.to_node.displayName) + UI.PREFIXER;
      } else if(owner === MODEL.equations_dataset) {
        this.owner_prefix = UI.completePrefix(attribute);
      } else {
        this.owner_prefix = UI.completePrefix(owner.displayName);
      }
      if(owner instanceof Dataset) {
        this.dataset = owner;
        // The attribute (if specified) is a dataset modifier selector.
        // This may be the name of an equation; this can be tested by
        // checking whether the owner is the equations dataset. 
        this.selector = attribute;
        // Record whether this selector contains wildcards (? and/or *
        // for selectors, ?? for equations).
        this.wildcard_selector = owner.isWildcardSelector(attribute);
        if(this.wildcard_selector) {
          // NOTE: Wildcard selectors override the context number that
          // may have been inferred from the dataset name.
          this.context_number = '?';
        } else { 
          // Normal selectors may have a "tail number". If so, this
          // overrides the tail number of the dataset.
          const tn = UI.tailNumber(attribute);
          if(tn) this.context_number = tn;
        }
        if(owner !== MODEL.equations_dataset) {
          // For "normal" modifier expressions, the "dot" (.) can be used
          // to refer to the dataset of the modifier.
          this.dot = this.dataset;
        }
      }
    }
    // Ensure that context number is either '?' or a number or FALSE.
    if(this.context_number !== '?') {
      this.context_number = parseInt(this.context_number);
      if(isNaN(this.context_number)) this.context_number = false;
    }
    // Immediately compile; this may generate warnings
    this.compile();
  }

  get ownerName() {
    // FOR TRACING & DEBUGGING: Returns the owner of this equation (if any).
    if(!this.owner) return '(no owner)';
    let n = this.owner.displayName;
    if(this.attribute) n += '|' + this.attribute;
    if(this.wildcard_selector) {
      n = [n, ' [wildcard ',
          (this.dataset === MODEL.equations_dataset ?
              'equation' : 'modifier'),
          (this.context_number !== false ?
               ' # = ' + this.context_number : ''),
          ']'].join('');
    }
    return n;
  }

  log(msg) {
    // NOTE: This method is used only to profile dynamic expressions.
    if(true) return;
    // Set the above IF condition to FALSE to profile dynamic expressions.
    console.log(`Expression for ${this.ownerName}: ${this.expr}\n${msg}`);
  }

  // The method parseVariable(name) checks whether `name` fits this pattern:
  //   {run}statistic$entity|attribute@offset_1:offset_2
  // allowing spaces within {run} and around | and @ and :
  // The entity is mandatory, but {run} and statistic$ are optional, and
  // attribute and offset have defaults.
  // It returns array [object, anchor_1, offset_1, anchor_2, offset_2] if
  // the pattern matches and no statistic, or the 6-element array
  // [statistic, object list, anchor, offset, anchor_2, offset_2]
  // if a valid statistic is specified; otherwise it returns FALSE.
  // The object is either a vector or an expression, or a special object
  // (dataset specifier, experiment run specifier or unit balance specifier)
  // NOTE: this array is used as argument for the virtual machine instructions
  // VMI_push_var, VMI_push_statistic and VMI_push_run_result.
  parseVariable(name) {
    // Reduce whitespace to single space.
    name = name.replace(/\s+/g, ' ');
    
    // For debugging, TRACE can be used to log to the console for
    // specific expressions and/or variables, for example:
    // this.TRACE = name.endsWith('losses') || this.ownerName.endsWith('losses');
    if(this.TRACE) console.log(
        `TRACE: Parsing variable "${name}" in expression for`,
        this.ownerName, ' -->  ', this.expr);
    
    // Initialize possible components.
    let obj = null,
        attr = '',
        use_data = false,
        cluster_balance_unit = false,
        anchor1 = '',
        offset1 = 0,
        anchor2 = '',
        offset2 = 0,
        msg = '',
        arg0 = null,
        args = null,
        s = name.split('@');
    if(s.length > 1) {
      // [variable@offset] where offset has form (anchor1)number1(:(anchor2)number 2)   
      // Offsets make expression dynamic (for now, ignore exceptional cases)
      this.is_static = false;
      this.log('dynamic because of offset');
      // String contains at least one @ character, then split at the last (pop)
      // and check that @ sign is followed by an offset (range if `:`)
      // NOTE: offset anchors are case-insensitive
      const offs = s.pop().replace(/\s+/g, '').toLowerCase().split(':');
      // Re-assemble the other substrings, as name itself may contain @ signs
      name = s.join('@').trim();
      const re = /(^[\+\-]?[0-9]+|[\#cfijklnprst]([\+\-][0-9]+)?)$/;
      if(!re.test(offs[0])) {
        msg = `Invalid offset "${offs[0]}"`;
      } else if(offs.length > 1 && !re.test(offs[1])) {
        msg = `Invalid second offset "${offs[1]}"`;
      }
      if(msg === '') {
        // Anchor may be:
        //  # (absolute index in vector)
        //  c (start of current block)
        //  f (first value of the vector, i.e., time step 0)
        //  i, j, k (iterator index variable)
        //  l (last value of the vector, i.e., time step t_N)
        //  n (start of next block)
        //  p (start of previous block)
        //  r (relative: relative time step, i.e., t0 = 1)
        //  s (scaled: time step 0, but offset is scaled to time unit of run)
        //  t (current time step, this is the default),
        if('#cfijklnprst'.includes(offs[0].charAt(0))) {
          anchor1 = offs[0].charAt(0);
          offset1 = safeStrToInt(offs[0].substring(1)); 
        } else {
          offset1 = safeStrToInt(offs[0]); 
        }
        if(offs.length > 1) {
          if('#cfijklnprst'.includes(offs[1].charAt(0))) {
            anchor2 = offs[1].charAt(0);
            offset2 = safeStrToInt(offs[1].substring(1));
          } else {
            offset2 = safeStrToInt(offs[1]); 
          }
        } else {
          // If only 1 offset specified, then set second equal to first
          anchor2 = anchor1;
          offset2 = offset1;
        }
        // Check whether # anchor is meaningful for this expression
        if((anchor1 === '#' || anchor2 === '#') &&
            !(this.wildcard_selector || this.context_number !== false)) {
          // Log debugging information for this error
          console.log(this.owner.displayName, this.owner.type, this.selector);
          this.error = 'Anchor # is undefined in this context';
          return false;
        }
      }
    }
    // Run specifier (optional) must be leading and braced
    // Specifier format: {method$title|run} where method and title are
    // optional -- NOTE: # in title or run is NOT seen as a wildcard
    if(name.startsWith('{')) {
      s = name.split('}');
      if(s.length > 1) {
        // Brace pair => interpret it as experiment result reference
        const x = {
            x: false, // experiment
            r: false, // run number
            v: false, // variable; if parametrized {n: name seg's, p: indices}  
            s: '',    // statistic
            m: '',    // method
            p: false, // periodic
            nr: false // run number range
          };
        // NOTE: name should then be in the experiment's variable list
        name = s[1].trim();
        s = s[0].substring(1);
        // Check for scaling method
        // NOTE: simply ignore $ unless it indicates a valid method
        const msep = s.indexOf('$');
        if(msep <= 5) {
          // Be tolerant as to case
          let method = s.substring(0, msep).toUpperCase();
          if(method.endsWith('P')) {
            x.p = true;
            method = method.slice(0, -1);
          }
          if(['ABS', 'MEAN', 'SUM', 'MAX', ''].indexOf(method) >= 0) {
            x.m = method;
            s = s.substring(msep + 1);
          }
        }
        s = s.split('#');
        let rn = (s.length > 1 ? s[1].trim() : false);
        // Experiment specifier may contain modifier selectors.
        s = s[0].trim().split(UI.OA_SEPARATOR);
        if(s.length > 1) {
          // If so, the selector list may indicate the run number.
          // NOTE: permit selectors to be separated by various characters.
          x.r = s.slice(1).join('|').split(/[\|\,\.\:\;\/\s]+/g);
        }
        if(rn) {
          // NOTE: Special notation for run numbers to permit modelers
          // to chart results as if run numbers are on the time axis
          // (with a given step size). The chart will be made as usual,
          // i.e., plot a point for each time step t, but the value v[t]
          // will then stay the same for the time interval that corresponds
          // to simulation period length / number of runs.
          // NOTE: This will fail to produce a meaningful chart when the
          // simulation period is small compared to the number of runs.
          if(rn.startsWith('n')) {
            // #n may be followed by a range, or this range defaults to
            // 0 - last run number. Of this range, the i-th number will
            // be used, where i is computes as:
            // floor(current time step * number of runs / period length)
            const range = rn.substring(1);
            // Call rangeToList only to validate the range syntax.
            if(rangeToList(range)) {
              x.nr = range;
              this.is_static = false;
              this.log('dynamic because experiment run number range');
            } else {
              msg = `Invalid experiment run number range "${range}"`;
            }
          } else {
            // Explicit run number is specified.
            const n = parseInt(rn);
            if(isNaN(n)) {
              msg = `Invalid experiment run number "${rn}"`;
            } else {
              // Explicit run number overrules selector list.
              x.r = n;
            }
          }
        }
        // NOTE: s[0] still holds the experiment title
        s = s[0].trim();
        if(s) {
          // NOTE: title cannot be parametrized with a # wildcard
          const n = MODEL.indexOfExperiment(s);
          if(n < 0) {
            msg = `Unknown experiment "${s}"`;
          } else {
            x.x = MODEL.experiments[n];
          }
        }
        // Variable name may start with a (case insensitive) statistic
        // specifier such as SUM or MEAN
        s = name.split('$');
        if(s.length > 1) {
          const stat = s[0].trim().toUpperCase();
          // NOTE: simply ignore $ (i.e., consider it as part of the
          // variable name) unless it is preceded by a valid statistic
          if(VM.outcome_statistics.indexOf(stat) >= 0) {
            x.s = stat;
            name = s[1].trim();
          }
        }
        // Variable name may start with a colon to denote that the owner
        // prefix should be added.
        name = UI.colonPrefixedName(name, this.owner_prefix);
        if(x.x) {
          // Look up name in experiment outcomes list
          x.v = x.x.resultIndex(name);
          if(x.v < 0 && name.indexOf('#') >= 0 &&
             typeof this.context_number === 'number') {
            // Variable name may be parametrized with #, but not in
            // expressions for wildcard selectors
            name = name.replace('#', this.context_number);
            x.v = x.x.resultIndex(name);
          }
          if(x.v < 0) {
            msg = ['Variable "', name, '" is not a result of experiment "',
              x.x.displayName, '"'].join('');
          }
        } else {
          // Check outcome list of ALL experiments
          for(let i = 0; i < MODEL.experiments.length; i++) {
            let xri = MODEL.experiments[i].resultIndex(name);
            if(xri < 0 && name.indexOf('#') >= 0 &&
               typeof this.context_number === 'number') {
              // Variable name may be parametrized with #, but not in
              // expressions for wildcard selectors.
              name = name.replace('#', this.context_number);
              xri = MODEL.experiments[i].resultIndex(name);
            }
            if(xri >= 0) {
              // If some match is found, the name specifies a variable
              x.v = xri;
              break;
            }
          }
        }
        // NOTE: experiment may still be FALSE, as this will be interpreted
        // as "use current experiment", but run number should be specified.
        if(!msg) {
          if(x.r === false && x.t === false) {
            msg = 'Experiment run not specified';
          } else if(x.v === false) {
            msg = `No experiments have variable "${name}" as result`;
          }
        }
        if(msg) {
          this.error = msg;
          return false;
        }
        // Notify modeler when two statistics are used.
        if(x.s && x.m) {
          UI.notify(`Method statistic (${x.m}) does not apply to ` +
              `run result statistic (${x.s})`);
        }
        // NOTE: Using AGGREGATED run results does NOT make the expression
        // dynamic, so only set is_static to FALSE if NO statistic or method.
        if(!x.s && !x.m) {
          this.is_static = false;
          this.log('dynamic because UNaggregated experiment result');
        }
        // For experiment run results, default anchor is 't'.
        if(!anchor1) anchor1 = 't';
        if(!anchor2) anchor2 = 't';
        if(this.TRACE) console.log('TRACE: Variable is run result. x =', x);
        // NOTE: compiler will recognize `x` to indicate "push run results".
        return [x, anchor1, offset1, anchor2, offset2];
      }
    }
    
    //
    // NOTE: For experiment results, the method will ALWAYS have returned
    // a result, so what follows does not apply to experiment results.
    //
    
    // If reached this stage, variable must be like this:
    // [(statistic$)entity name pattern(|attribute)]
    // Attribute name (optional) follows the object-attribute separator |
    s = name.split(UI.OA_SEPARATOR);
    if(s.length > 1) {
      // Attribute is string after the LAST separator...
      attr = s.pop().trim();
      // ... so restore `name` in case itself contains other separators.
      name = s.join(UI.OA_SEPARATOR).trim();
      if(!attr) {
        // Explicit *empty* attribute, e.g., [name|]
        // NOTE: This matters for datasets having specifiers: the vertical
        // bar indicates "do not infer a modifier from a running experiment,
        // but use the data".
        use_data = true;
      } else if(attr.startsWith('=')) {
        // Attribute starting with = indicates cluster balance
        // NOTE: empty string is considered as "any unit".
        cluster_balance_unit = attr.substring(1).trim();
      } else if(attr.indexOf('?') >= 0 || attr.indexOf('#') >= 0) {
        // Wildcard selectors of dataset modifiers cannot be used.
        this.error = `Invalid attribute "${attr}"`;
        return false;
      }
    }

    // Check whether a statistic is specified.
    let pat = name.split('$');
    if(pat.length > 1 &&
        VM.statistic_operators.indexOf(pat[0].toUpperCase()) >= 0) {
      // For statistics, the default anchor is 't'.
      if(!anchor1) anchor1 = 't';
      if(!anchor2) anchor2 = 't';
      // Check whether unit balance for clusters is asked for.
      if(cluster_balance_unit !== false) {
        this.error = 'Aggregation of unit balance over clusters is not supported';
        return false;
      }
      // Consider only the first $ as statistic separator. 
      const stat = pat.shift().toUpperCase();
      // Reassemble pattern string, which may itself contain $.
      pat = pat.join('$');
      // Special case: dataset "dot" is NOT a pattern.
      if(pat === '.') {
        // NOTE: The "dot" dataset is not level-dependent, and statistics
        // over its vector do NOT make the expression dynamic.
        if(this.dot) {
          args = [stat, [this.dot.vector], anchor1, offset1, anchor2, offset2];
          if(this.TRACE) console.log('TRACE: Variable is a statistic:', args);
          return args;
        } else {
          this.error = UI.ERROR.NO_DATASET_DOT;
          return false;
        }
      }
/*
      // DEPRECATED -- Modeler can deal with this by smartly using AND
      // clauses like "&x: &y:" to limit set to specific prefixes.
      
      // Deal with "prefix inheritance" when pattern starts with a colon.
      if(pat.startsWith(':') && this.owner_prefix) {
        // Add a "must start with" AND condition to all OR clauses of the
        // pattern.
        // NOTE: Issues may occur when prefix contains &, ^ or #.
        // @@TO DO: See if this can be easily prohibited.
        const oc = pat.substring(1).split('|');
        for(let i = 0; i < oc.length; i++) {
          oc[i] = `~${this.owner_prefix}&${oc[i]}`;
        }
        pat = oc.join('|');
      }
*/
      // NOTE: For patterns, assume that # *always* denotes the context-
      // sensitive number #, because if modelers wishes to include
      // ANY number, they can make their pattern less selective.
      if(typeof this.context_number === 'number') {
        pat = pat.replace('#', this.context_number);
      }
      // By default, consider all entity types.
      let et = VM.entity_letters,
          patstr = pat;
      // Selection may be limited to specific entity types by prefix "...?"
      // where ... is one or more entity letters (A for actor, etc.).
      if(/^[ABCDELPQ]+\?/i.test(pat)) {
        pat = pat.split('?');
        et = pat[0].toUpperCase();
        pat = pat.slice(1).join('=');
      }
      // Get the name pattern.
      pat = patternList(pat);
      // Infer the entity type(s) from the attribute (if defined).
      const
          list = [],
          // NOTE: The optional second parameter `et` will limit the
          // returned list to the specified entity types.
          ewa = MODEL.entitiesWithAttribute(attr, et);
      // Create list of expression objects for the matching entities.
      // Also create a "dict" with, for each matching wildcard number,
      // the matching entities as a separate list. This will permit
      // narrowing the selection at run time, based on the expression's
      // wildcard number.
      const wdict = {};
      for(let i = 0; i < ewa.length; i++) {
        const e = ewa[i];
        if(patternMatch(e.displayName, pat)) {
          const mnr = matchingWildcardNumber(e.displayName, pat);
          // NOTE: Attribute may be a single value, a vector, or an expression.
          obj = e.attributeValue(attr);
          // If neither a single value nor a vector, it must be an expression.
          if(obj === null) obj = e.attributeExpression(attr);
          // Double-check: only add it if it is not NULL.
          if(obj) {
            list.push(obj);
            if(mnr) {
              if(!wdict[mnr]) wdict[mnr] = [];
              wdict[mnr].push(obj);
            }
            // Expression becomes dynamic if any element that is added is
            // neither a single value nor a static expression.
            if(Array.isArray(obj) ||
                (obj instanceof Expression && !obj.isStatic)) {
              this.is_static = false;
              this.log('dynamic because matching object is array or dynamic expression');
            }
          }
        }
      }
      // NOTE: If no attribute is specified, also add expressions for
      // equations that match UNLESS entity type specifier excludes them.
      if(!attr && (!et || et.indexOf('E') >= 0)) {
        const edm = MODEL.equations_dataset.modifiers;
        for(let k in edm) if(edm.hasOwnProperty(k)) {
          const m = edm[k];
          if(patternMatch(m.selector, pat)) {
            list.push(m.expression);
            if(!m.expression.isStatic) {
              this.is_static = false;
              this.log('dynamic because matching equation is dynamic');
            }
          }
        }
      }
      if(list.length > 0) {
        // NOTE: Statistic MAY make expression level-based.
        // Assume that this is NOT so when an offset has been specified,
        // as this suggests that modelers know what they're doing.
        this.is_level_based = this.is_level_based || 
            VM.level_based_attr.indexOf(attr) >= 0 &&
                anchor1 === 't' && offset1 === 0 &&
                anchor2 === 't' && offset2 === 0;
        args = [stat, list, anchor1, offset1, anchor2, offset2];
        if(Object.keys(wdict).length > 0) args.push(wdict);
        if(this.TRACE) console.log('TRACE: Variable is a statistic:', args);
        // NOTE: Compiler will recognize 6- or 7-element list as a
        // sign to use the VMI_push_statistic instruction.
        return args;
      }
      this.error = `No entities that match pattern "${patstr}"` +
          (attr ? ' and have attribute ' + attr : ' when no attribute is specified');
      return false;
    }
    
    //
    // NOTE: For statistics, the method will ALWAYS have returned a result,
    // so what follows does not apply to statistics results, but only to
    // "plain" variables like [entity name(|attribute)].
    //
    
    // For all entity types except array-type datasets, the default anchor
    // for offsets is the current time step `t`.
    if(!(this.dataset && this.dataset.array)) {
      if(!anchor1) anchor1 = 't';
      if(!anchor2) anchor2 = 't';
    }
    // First handle this special case: no name or attribute. This is valid
    // only for dataset modifier expressions (and hence also equations).
    // Variables like [@t-1] are interpreted as a self-reference. This is
    // meaningful when a *negative* offset is specified to denote "use the
    // value of this expression for some earlier time step".
    // NOTES:
    // (1) This makes the expression dynamic.
    // (2) It does not apply to array-type datasets, as these have no
    //     time dimension.
    if(!name && !attr && this.dataset && !this.dataset.array) {
      this.is_static = false;
      this.log('dynamic because of self-reference');
      if(('cips'.indexOf(anchor1) >= 0 || anchor1 === 't' && offset1 < 0) &&
          ('cips'.indexOf(anchor2) >= 0 ||anchor2 === 't' && offset2 < 0)) {
        if(this.TRACE) console.log('TRACE: Variable is a self-reference.');
        // The `xv` attribute will be recognized by VMI_push_var to denote
        // "use the vector of the expression for which this VMI is code".
        return [{xv: true, dv: this.dataset.defaultValue},
            anchor1, offset1, anchor2, offset2];
      }
      msg = 'Expression can reference only previous values of itself';
    }
    // A leading "!" denotes: pass variable reference instead of its value.
    // NOTE: This also applies to the "dot", so [!.] is a valid variable.
    let by_reference = name.startsWith('!');
    if(by_reference) name = name.substring(1);
    // When `name` is a single dot, it refers to the dataset for which the
    // modifier expression is being parsed. Like all datasets, the "dot"
    // may also have an attribute.
    if(name === '.') {
      obj = this.dot;
      if(!obj) msg = UI.ERROR.NO_DATASET_DOT;
    } else if(name.indexOf('??') >= 0) {
      msg = 'Use # as wildcard, not ??';
    }
    if(msg) {
      this.error = msg;
      return false;
    }
    // Check whether name refers to a Linny-R entity defined by the model.
    if(!obj) {
      // Variable name may start with a colon to denote that the owner
      // prefix should be added.
      name = UI.colonPrefixedName(name, this.owner_prefix);
      // Start with wildcard equations, as these are likely to be few
      // (so a quick scan) and constitute a special case.
      const
          id = UI.nameToID(name),
          w = MODEL.wildcardEquationByID(id);
      if(w) {
        if(this.TRACE) console.log('TRACE: Variable is a wildcard equation:',
            w[0], '-- number is', w[1], '\nTRACE: Equation expression: ',
            w[0].expression.text);
        // Variable matches wildcard equation w[0] with number w[1],
        // so this equation must be evaluated for that number.
        return [
            {d: w[0].dataset, s: w[1], x: w[0].expression},
            anchor1, offset1, anchor2, offset2];        
      }
      // If no match, try to match the object ID with any type of entity.
      obj = MODEL.objectByID(id);
    }
    // If not, try whether wildcards can be substituted.
    if(!obj && name.indexOf('#') >= 0) {
      if(typeof this.context_number === 'number') {
        obj = MODEL.objectByName(name.replace('#', this.context_number));
      }
      if(obj && TRACE) console.log('TRACE: Matched ', name,
          'with entity:', obj.displayName);
      if(!obj) {
        // If immediate substitution of # does not identify an entity,
        // then name may still refer to a wildcard equation.
        const wcname = name.replace('#', '??');
        // Check for self-reference.
        if(wcname === this.attribute) {
          msg = 'Equation cannot reference itself';
        } else {
          obj = MODEL.equationByID(UI.nameToID(wcname));
          if(obj) {
            // Special case: the parsed variable references a wildcard
            // equation, so now `obj` is an instance of DatasetModifier.
            if(!(this.wildcard_selector || this.context_number)) {
              msg = UI.ERROR.NO_NUMBER_CONTEXT;
            } else {
              // Acceptable reference to a wildcard equation.
              if(!obj.expression.isStatic) {
                this.is_static = false;
                this.log('dynamic because wildcard equation is dynamic');
              }
              // NOTE: The referenced expression may be level-dependent.
              this.is_level_based = this.is_level_based ||
                  obj.expression.is_level_based;
              if(this.TRACE) console.log('TRACE: Variable ', name,
                  'is a wildcard equation:', obj.displayName,
                  '-- number is:', this.context_number,
                  '\nTRACE: Expression:', obj.expression.text);
              // Use the context number as "selector" parameter of the VMI.
              return [
                  {d: obj.dataset, s: this.context_number, x: obj.expression},
                  anchor1, offset1, anchor2, offset2];
            }
          }
        }
      }
      if(!obj) {
        // Final possibility is a match with a tail-numbered entity name.
        // NOTE: also pass `attr` so that only entities having this
        // attribute will match.
        const ame = MODEL.allMatchingEntities(wildcardMatchRegex(name), attr);
        if(ame.length > 0) {
          // NOTE: Some attributes make this expression level-dependent.
          const uca = attr.toUpperCase();
          this.is_level_based = this.is_level_based ||
             VM.level_based_attr.indexOf(uca) >= 0;
          // Pass the eligible entities along with the selector, so that
          // at run time the VM can match with the value of #.
          // NOTE: Also pass whether the entity should be pushed
          // "by reference".
          if(this.TRACE) console.log('TRACE: Variable', name,
              'matches with tail-numbered entities:', ame,
              '\nTRACE: Attribute used:', uca);
          return [{n: name, ee: ame, a: uca, br: by_reference},
              anchor1, offset1, anchor2, offset2];
        }
        // Wildcard selector, but no number context for #.
        msg = UI.ERROR.NO_NUMBER_CONTEXT;
      }
    }
    if(msg) {
      this.error = msg;
      return false;
    }
    // Now `obj` refers to a model entity (ABCDELPQ).
    // This parseVariable(...) function must return a tuple like this:
    // [object or vector, anchor 1, offset 1, anchor 2, offset 2]
    // because this will be passed along with the VM instruction that
    // pushes the variable on the operand stack of this expression.
    if(obj === null) {
      msg = `Unknown entity "${name}"`;
    } else if(obj.array &&
        (anchor1 && '#ijk'.indexOf(anchor1) < 0 ||
         anchor2 && '#ijk'.indexOf(anchor2) < 0)) {
      // Only indices (i, j, k) and the # number can index arrays, as arrays
      // have no time dimension, while all other anchors relate to time.
      msg = 'Invalid anchor(s) for array-type dataset ' + obj.displayName;
    } else {
      // If the variable denotes an equation or a dataset with a selector,
      // check whether this is the "owner" of the expression being parsed. 
      let sel = '',
          xtype = '';
      if(obj instanceof DatasetModifier) {
        sel = obj.selector;
        xtype = 'Equation';
      } else if(obj instanceof Dataset) {
        sel = attr;
        xtype = 'Dataset modifier expression';
      }
      // In variable names, wildcards are denoted as #, so also check for
      // the (unlikely) case that [eq#x] is used in the expression for a
      // wildcard equation or dataset modifier with name "eq??x".
      if(sel && (sel === this.selector ||
          sel.replace('#', '??') === this.selector)) {
        // Match indicates a cyclic reference
        msg = `${xtype} must not reference itself`;
      }
    }
    if(msg) {
      this.error = msg;
      return false;
    }
    // If `obj` is a dataset *modifier*, it must be a "normal" equation...
    if(obj instanceof DatasetModifier) {
      if(this.TRACE) console.log('TRACE: Dataset modifier "' + obj.displayName +
          '" mapped to dataset:', obj.dataset.name,
          'and selector:', obj.selector);
      // ... so "map" it onto the equations dataset + selector...
      attr = obj.selector;
      obj = obj.dataset;
    }
    // ... so now it will be processed the same way dataset modifiers
    // are processed, especially when they have a tail number.
    
    // Set default anchors in case no anchors are specified.
    // Except for array-type datasets, the default anchor is 't';
    // for array-type datasets in expressions for array-type datasets,
    // the SPECIAL anchor is '^' to indicate "use parent anchor"
    // (which will be the parent's context-sensitive number #)
    const default_anchor = (obj.array ?
        (this.dataset && this.dataset.array ? '^' : '') : 't');
    if(!anchor1) anchor1 = default_anchor;
    if(!anchor2) anchor2 = default_anchor;

    // If "by reference", return the object itself plus its attribute
    if(by_reference) {
      if(this.TRACE) console.log('TRACE: Variable is a reference to',
          obj.displayName, '. Attribute:', attr);
      return [{r: obj, a: attr}, anchor1, offset1, anchor2, offset2];
    }
    if(obj === this.dataset && attr === '' && !obj.array) {
      // When dataset modifier expression refers to its dataset without
      // selector, then this is equivalent to [.] (use the series data
      // vector) unless it is an array, since then the series data is
      // not a time-scaled vector => special case.
      if(this.TRACE) console.log(
          'TRACE: Dataset without selector, no array:', obj.displayName,
          'Use vector:', obj.vector);
      arg0 = obj.vector;
    } else if(attr === '') {
      // For all other variables, assume default attribute if none specified
      attr = obj.defaultAttribute;
      // For a dataset, check whether the VMI_push_dataset_modifier should be
      // used. This is the case for array-type datasets, and for datasets
      // having modifiers UNLESS the modeler used a vertical bar to indicate
      // "use the data".
      if(obj instanceof Dataset &&
          (obj.array || (!use_data && obj.selectorList.length > 0))) {
        // No explicit selector means that this variable is dynamic if
        // the dataset has time series data, or if some of its modifier
        // expressions are dynamic.
        if(obj.data.length > 1 || (obj.data.length > 0 && !obj.periodic) ||
            !obj.allModifiersAreStatic) {
          this.is_static = false;
          this.log('dynamic because dataset without explicit selector is used');
        }
        if(this.TRACE) console.log(
            'TRACE: Dataset without explicit selector:',
            (obj.array ? 'array' : 'has modifiers'), obj.displayName,
            '\nTRACE: Use VMI_push_dataset_modifier; use-data flag:', use_data);
        // NOTE: Also pass the "use data" flag so that experiment selectors
        // will be ignored if the modeler coded the vertical bar.
        return [{d: obj, ud: use_data}, anchor1, offset1, anchor2, offset2];
      }
    } else if(obj instanceof Dataset) {
      // For datasets, the attribute must be a modifier selector, so first
      // check if this dataset has a modifier that matches `attr`.
      const mm = obj.matchingModifiers([attr]);
      if(mm.length === 0) {
        // No match indicates unknown attribute.
        this.error = `Dataset ${obj.displayName} has no modifier with selector "${attr}"`;
        return false;
      } else {
        // NOTE: Multiple matches are impossible because `attr` cannot
        // contain wildcards; hence this is a unique match, so the modifier
        // expression is known.
        const m = mm[0];
        if(!m.expression.isStatic) {
          this.is_static = false;
          this.log('dynamic because dataset modifier expression is dynamic');
        }
        // NOTE: A single match may be due to wildcard(s) in the modifier,
        // e.g., a variable [dataset|abc] matches with a modifier having
        // wildcard selector "a?b", or [dataset|a12] matches with "a*".
        // In such cases, if the selector matches an integer like "a12"
        // in the example above, this number (12) should be used as
        // number context (overriding the number of the dataset, so
        // for [datset34|a12], the number context is '12' and not '34').
        let mcn = matchingNumber(attr, m.selector);
        if(mcn === false) {
          // NOTE: When no matching number is found, `attr` may still
          // contain a ?? wildcard. If it indeed identifies a wildcard
          // equation, then "?" should be passed to the VM instruction.
          if(obj === MODEL.equations_dataset && attr.indexOf('??') >= 0) {
            mcn = '?';
          } else {
            // Ensure that `mcn` is either an integer value or FALSE.
            mcn = parseInt(UI.tailNumber(obj.name)) || this.context_number;
          }
        }
        // Pass the dataset, the context number # (or FALSE) in place,
        // and the modifier expression.
        if(this.TRACE) console.log('TRACE: Variable is',
            (m.dataset === MODEL.equations_dataset ?
                'an equation: ' + m.selector :
                'a dataset with explicit selector: ' + m.displayName),
            '\nTRACE: Context number:', mcn, ' Expression:', m.expression.text);
        return [
            {d: m.dataset, s: mcn, x: m.expression},
            anchor1, offset1, anchor2, offset2];
      }
    }
    // NOTE: `arg0` can now be a single value, a vector, or NULL.
    if(arg0 === null) arg0 = obj.attributeValue(attr);
    if(Array.isArray(arg0)) {
      if(obj instanceof Dataset) {
        if(obj.data.length > 1 || obj.data.length > 0 && !obj.periodic) {
          this.is_static = false;
          this.log('dynamic because dataset vector is used');
        }
      } else if(VM.level_based_attr.indexOf(attr) >= 0) {
        this.is_static = false;
        this.log('dynamic because level-based attribute');
      } else {
        // Unusual (?) combi, so let's assume dynamic.
        this.is_static = false;
        this.log('probably dynamic --  check below:'); 
        console.log('ANOMALY: array for', obj.displayName, obj, attr, arg0);
      }
      if(this.TRACE) console.log('TRACE: arg[0] is a vector');
    }
    // If not a single value or vector, it must be an expression.
    if(arg0 === null) arg0 = obj.attributeExpression(attr);
    if(arg0 === null) {
      // Only NOW check whether unit balance for clusters is asked for.
      if(cluster_balance_unit !== false && obj instanceof Cluster) {
        // NOTE: Cluster balance ALWAYS makes expression level-based
        // and dynamic.        
        this.is_level_based = true;
        this.is_static = false;
        this.log('dynamic because cluster balance is level-based');
        if(this.TRACE) console.log('TRACE: Variable is a balance:',
            cluster_balance_unit, 'for cluster', obj.displayName);
        // NOTE: VM instructions VMI_push_var will recognize this special case
        return [{c: obj, u: cluster_balance_unit},
            anchor1, offset1, anchor2, offset2];
      }
      // Fall-through: invalid attribute for this object
      msg = `${obj.type} entities have no attribute "${attr}"`;
    } else {
      if(arg0 instanceof Expression) {
        this.is_static = this.is_static && arg0.isStatic;
      }
      if(this.TRACE) console.log('TRACE: arg[0] is the expression for',
          arg0.variableName, '\nTRACE: Expression:', arg0.text);
      args = [arg0, anchor1, offset1, anchor2, offset2];
    }
    if(msg) {
      this.error = msg;
      return false;
    }
    // Now `args` should be a valid argument for a VM instruction that
    // pushes an operand on the evaluation stack.
    // Check whether the attribute is level-based (i.e., can be computed
    // only after optimizing a block) while no offset is defined to use
    // prior data.
    this.is_level_based = this.is_level_based ||
        // NOTE: Dataset modifier expressions may be level-based.
        (obj instanceof Dataset && attr && arg0.is_level_based) ||
        // Assume NOT level-based if anchor & offset are specified.
        // NOTE: This is based on the assumption that advanced modelers
        // know what they are doing.
        (VM.level_based_attr.indexOf(attr) >= 0 &&
            anchor1 === 't' && offset1 === 0 &&
            anchor2 === 't' && offset2 === 0);
    return args;
  }

  getSymbol() {
    // Gets the next substring in the expression that is a valid symbol
    // while advancing the position-in-text (`pit`) and length-of-symbol
    // (`los`), which are used to highlight the position of a syntax error
    // in the expression editor
    let c, f, i, l, v;
    this.prev_sym = this.sym;
    this.sym = null;
    // Skip whitespace
    while(this.pit <= this.eot && this.expr.charAt(this.pit) <= ' ') {
      this.pit++;
    }
    if(this.pit > this.eot) return;
    c = this.expr.charAt(this.pit);
    if(c === '[') {
      // Left bracket denotes start of a variable name
      i = indexOfMatchingBracket(this.expr, this.pit);
      if(i < 0) {
        this.pit++;
        this.los = 1;
        this.error = 'Missing closing bracket \']\'';
      } else {
        v = this.expr.substring(this.pit + 1, i);
        this.pit = i + 1;
        // NOTE: Enclosing brackets are also part of this symbol
        this.los = v.length + 2;
        // Push the array [identifier, anchor1, offset1, anchor2, offset2],
        // or FALSE if variable name is not valid.
        this.sym = this.parseVariable(v);
        // NOTE: parseVariable may set is_static to FALSE
      }
    } else if(c === "'") {
      // Symbol is ALL text up to and including closing quote and trailing
      // spaces (but such spaces are trimmed)
      i = this.expr.indexOf("'", this.pit + 1);
      if(i < 0) {
        this.pit++;
        this.los = 1;
        this.error = 'Unmatched quote';
      } else {
        v = this.expr.substring(this.pit + 1, i);
        this.pit = i + 1;
        // NOTE: Enclosing quotes are also part of this symbol
        this.los = v.length + 2;
        v = UI.cleanName(v);
        if(MODEL.scale_units.hasOwnProperty(v)) {
          // Symbol is a scale unit => use its multiplier as numerical value
          this.sym = MODEL.scale_units[v].multiplier;
        } else {
          this.error = `Unknown scale unit "${v}"`;
        }
      }
    } else if(c === '(' || c === ')') {
      this.sym = c;
      this.los = 1;
      this.pit++;
    } else if(OPERATOR_CHARS.indexOf(c) >= 0) {
      this.pit++;
      // Check for compound operators (!=, <>, <=, >=) and if so, append
      // the second character
      if(this.pit <= this.eot &&
          COMPOUND_OPERATORS.indexOf(c + this.expr.charAt(this.pit)) >= 0) {
        c += this.expr.charAt(this.pit);
        this.pit++;
      }
      this.los = c.length;
      // Instead of the operator symbol, the corresponding VM instruction
      // should be pushed onto the symbol stack
      this.sym = OPERATOR_CODES[OPERATORS.indexOf(c)];
    } else {
      // Take any text up to the next operator, parenthesis,
      // opening bracket, quote or space
      this.los = 0;
      let pl = this.pit + this.los,
          cpl = this.expr.charAt(pl),
          pcpl = '',
          digs = false;
      // NOTE: + and - operators are special case, since they may also
      // be part of a floating point number, hence the more elaborate check
      while(pl <= this.eot && (SEPARATOR_CHARS.indexOf(cpl) < 0 ||
          ('+-'.indexOf(cpl) >= 0 && digs && pcpl.toLowerCase() === 'e'))) {
        digs = digs || '0123456789'.indexOf(cpl) >= 0;
        this.los++;
        pl++;
        pcpl = cpl;
        cpl = this.expr.charAt(pl);
      }
      // Include trailing spaces in the source text...
      while(this.pit + this.los <= this.eot &&
          this.expr.charAt(this.pit + this.los) === ' ') {
        this.los++;
      }
      // ... but trim spaces from the symbol
      v = this.expr.substring(this.pit, this.pit + this.los).trim();
      // Ignore case
      l = v.toLowerCase();
      if(l === '#') {
        // # symbolizes the numeric part of a dataset selector, so check
        // whether the expression being parsed is a dataset modifier with
        // a selector that has a numeric wildcard OR whether # can be inferred
        // from the owner
        if(this.selector.indexOf('*') >= 0 ||
            this.selector.indexOf('?') >= 0 ||
            this.owner.numberContext) {
          this.sym = VMI_push_contextual_number;
        } else {
          this.error = '# is undefined in this context';
        }
      } else if('0123456789'.indexOf(l.charAt(0)) >= 0) {
        // If symbol starts with a digit, check whether it is a valid number
        if(/^\d+((\.|\,)\d*)?(e[\+\-]?\d+)?$/.test(l)) {
          f = safeStrToFloat(l, l);
        } else {
          f = NaN;
        }
        // If not, report error
        if(isNaN(f) || !isFinite(f)) {
          this.error = `Invalid number "${v}"`;
        } else {
          // If a valid number, keep it within the +/- infinity range
          this.sym = Math.max(VM.MINUS_INFINITY, Math.min(VM.PLUS_INFINITY, f));
        }
      } else if(MODEL.scale_units.hasOwnProperty(v)) {
        // Symbol is a scale unit => use its multiplier as numerical value
        this.sym = MODEL.scale_units[v].multiplier;
      } else {
        // Symbol does not start with a digit
        // NOTE: distinguish between run length N and block length n
        i = ACTUAL_SYMBOLS.indexOf(l === 'n' ? v : l);
        if(i < 0) {
          this.error = `Invalid symbol "${v}"`;
        } else {
          this.sym = SYMBOL_CODES[i];
          // NOTE: Using time symbols or `random` makes the expression dynamic! 
          if(DYNAMIC_SYMBOLS.indexOf(l) >= 0) this.is_static = false;
        }
      }
      this.pit += this.los;
    }
    // A minus is monadic if at the start of the expression, or NOT preceded
    // by a "constant symbol", a number, or a closing parenthesis `)`.
    // Constant symbols are time 't', block start 'b', block length 'n',
    // look-ahead 'l', 'random', 'true', 'false', 'pi', and 'infinity'
    if(DYADIC_CODES.indexOf(this.sym) === DYADIC_OPERATORS.indexOf('-') &&
        (this.prev_sym === null ||
            !(Array.isArray(this.prev_sym) ||
            typeof this.prev_sym === 'number' ||
            this.prev_sym === ')' ||
            CONSTANT_CODES.indexOf(this.prev_sym) >= 0))) {
      this.sym = VMI_negate;
    }
  }

  codeOperation(op) {
    // Adds operation (which is an array [function, [arguments]]) to the
    // code, and "pops" the operand stack only if the operator is dyadic
    // NOTE: since version 1.0.14, IF-THEN-ELSE operators are a special
    // case as they no longer are "pure" stack automaton operations
    if(op === VMI_if_then) {
      if(this.if_stack.length < 1) {
        this.error = 'Unexpected ?';
      } else {
        // A ? operator is "coded" when it is popped from the operator
        // stack, typically chased by :, and possibly by ) or ; or EOT,
        // and this means that all VM code for the THEN part has been
        // added, so `code.length` will be the index of the first
        // instruction coding the ELSE part (if present). This index
        // is the target for the most recently added JUMP-IF-FALSE
        let target = this.code.length;
        // NOTE: when ? is chased by :, this means that the THEN part
        // must end with a JUMP instruction BUT this JUMP instruction
        // has not been coded yet (as this is done AFTER popping the
        // operator stack); hence check whether the "chasing" operator
        // (this.sym) is a :, and if so, add 1 to the target address 
        if(this.sym === VMI_if_else) target++;
        this.code[this.if_stack.pop()][1] = target;
      }
    } else if (op === VMI_if_else) {
      if(this.then_stack.length < 1) {
        this.error = 'Unexpected :';
      } else {
        // Similar to above: when a : operator is "coded", the ELSE part
        // has been coded, so the end of the code array is the target for
        // the most recently added JUMP
        this.code[this.then_stack.pop()][1] = this.code.length;
      }
    } else {
      // All other operations require VM instructions that operate on the
      // expression stack
      this.code.push([op, null]);
      if(op === VMI_concat) {
        this.concatenating = true;
      } else {
        const randcode = RANDOM_CODES.indexOf(op) >= 0;
        if(REDUCING_CODES.indexOf(op) >= 0) {
          if(randcode && !this.concatenating) {
            // NOTE: probability distributions MUST have a parameter list but
            // MIN and MAX will also accept a single argument
            console.log('OPERATOR:', op);
            this.error = 'Missing parameter list';
          }
          this.concatenating = false;
        }
        if(randcode) this.is_static = false;
        if(LEVEL_BASED_CODES.indexOf(op) >= 0) this.is_level_based = true;
      }
    }
    if(DYADIC_CODES.indexOf(op) >= 0) this.sym_stack--;
    if(this.sym_stack <= 0) this.error = 'Missing operand';
  }

  compile() {
    // Compiles expression into array of VM instructions `code`
    // NOTE: always create a new code array instance, as it will typically
    // become the code attribute of an expression object
    if(DEBUGGING) console.log('COMPILING', this.ownerName, ':\n',
        this.expr, '\ncontext number =', this.context_number);
    this.code = [];
    // Position in text
    this.pit = 0;
    // Length of symbol
    this.los = 0;
    // Error message also serves as flag: stop compiling if not empty
    this.error = '';
    // `is_static` becomes FALSE when a time-dependent operand is detected
    this.is_static = true;
    // `is_level_based` becomes TRUE when a level-based variable is detected
    this.is_level_based = false;
    // `concatenating` becomes TRUE when a concatenation operator (semicolon)
    // is pushed, and FALSE when a reducing operator (min, max, normal, weibull,
    // triangular) is pushed
    this.concatenating = false;
    // An empty expression should return the "undefined" value
    if(this.expr.trim() === '') {
      this.code.push([VMI_push_number, VM.UNDEFINED]);
      return; 
    }
    // Parse the expression using Edsger Dijkstra's shunting-yard algorithm
    // vmi = virtual machine instruction (a function)
    let vmi;
    // eot = end of text (index of last character in string)
    this.eot = this.expr.length - 1;
    this.sym = null; // current symbol
    this.prev_sym = null; // previous symbol
    this.sym_stack = 0; // counts # of operands on stack
    this.op_stack = []; // operator stack
    this.if_stack = []; // stack of indices of JUMP-IF-FALSE instructions
    this.then_stack = []; // stack of indices of JUMP instructions
    this.custom_stack = []; // stack for custom operator objects
    while(this.error === '' && this.pit <= this.eot) {
      this.getSymbol();
      if(this.error !== '') break;
      if(this.sym === '(') {
        // Opening parenthesis is ALWAYS pushed onto the stack
        this.op_stack.push(this.sym);
      } else if(this.sym === ')') {
        // Closing parenthesis => pop all operators until its matching
        // opening parenthesis is found 
        if(this.op_stack.indexOf('(') < 0) {
          this.error = 'Unmatched \')\'';
        } else if(this.prev_sym === '(' ||
          OPERATOR_CODES.indexOf(this.prev_sym) >= 0) {
          // Parenthesis immediately after an operator => missing operand
          this.error = 'Missing operand';
        } else {
          // Pop all operators up to and including the matching parenthesis
          vmi = null;
          while(this.op_stack.length > 0 &&
            this.op_stack[this.op_stack.length - 1] !== '(') {
            // Pop the operator
            vmi = this.op_stack.pop();
            this.codeOperation(vmi);
          }
          // Also pop the opening parenthesis
          this.op_stack.pop();
        }
      } else if(this.sym === VMI_if_else &&
        this.op_stack.indexOf(VMI_if_then) < 0) {
        // : encountered without preceding ?
        this.error = '\':\' (else) must be preceded by \'?\' (if ... then)';
      } else if(OPERATOR_CODES.indexOf(this.sym) >= 0) {
        let topop = (this.op_stack.length > 0 ?
              this.op_stack[this.op_stack.length - 1] : null),
            topprio = PRIORITIES[OPERATOR_CODES.indexOf(topop)],
            symprio = PRIORITIES[OPERATOR_CODES.indexOf(this.sym)];
        // Pop all operators having a higher or equal priority than the one
        // to be pushed EXCEPT when this priority equals 9, as monadic operators
        // bind right-to-left
        while(this.op_stack.length > 0 && OPERATOR_CODES.indexOf(topop) >= 0 &&
          topprio >= symprio && symprio !== 9) {
          // The stack may be emptied, but if it contains a (, this
          // parenthesis is unmatched
          if(topop === '(') {
            this.error = 'Missing \')\'';
          } else {
            vmi = this.op_stack.pop();
            this.codeOperation(vmi);
            if(this.op_stack.length >= 0) {
              topop = this.op_stack[this.op_stack.length - 1];
              topprio = PRIORITIES[OPERATOR_CODES.indexOf(topop)];
            } else {
              topop = null;
              topprio = 0;
            }
          }
        }
        
        // NOTE: as of version 1.0.14, (a ? b : c) is implemented with
        // "jump"-instructions so that only b OR c is evaluated instead
        // of both
        if(this.sym === VMI_if_then) {
          // Push index of JUMP-IF-FALSE instruction on if_stack so that
          // later its dummy argument (NULL) can be replaced by the
          // index of the first instruction after the THEN part
          this.if_stack.push(this.code.length);
          this.code.push([VMI_jump_if_false, null]);
        } else if(this.sym === VMI_if_else) {
          this.then_stack.push(this.code.length);
          this.code.push([VMI_jump, null]);
          // NOTE: if : is not omitted, the code for the ELSE part must
          // start by popping the FALSE result of the IF condition
          this.code.push([VMI_pop_false, null]);
        }
        // END of new code for IF-THEN-ELSE

        this.op_stack.push(this.sym);
      } else if(this.sym !== null) {
        // Symbol is an operand
        if(CONSTANT_CODES.indexOf(this.sym) >= 0) {
          this.code.push([this.sym, null]);
        } else if(Array.isArray(this.sym)) {
          // Either a statistic, a dataset (array-type or with modifier),
          // an experiment run result, or a variable.
          if(this.sym.length >= 6) {
            // 6 or 7 arguments indicates a statistic.
            this.code.push([VMI_push_statistic, this.sym]);
          } else if(this.sym[0].hasOwnProperty('d')) {
            this.code.push([VMI_push_dataset_modifier, this.sym]);
          } else if(this.sym[0].hasOwnProperty('ee')) {
            this.code.push([VMI_push_wildcard_entity, this.sym]);
          } else if(this.sym[0].hasOwnProperty('x')) {
            this.code.push([VMI_push_run_result, this.sym]);
          } else if(this.sym[0].hasOwnProperty('r')) {
            this.code.push([VMI_push_entity, this.sym]);
          } else {
            this.code.push([VMI_push_var, this.sym]);
          }
        } else {
          this.code.push([VMI_push_number, this.sym]);
        }
        this.sym_stack++;
      }
    }  // END of main WHILE loop
    // End of expression reached => code the unprocessed operators
    while(this.error === '' && this.op_stack.length > 0) {
      if(this.op_stack[this.op_stack.length - 1] === '(') {
        this.error = 'Missing \')\'';
      } else {
        vmi = this.op_stack.pop();
        this.codeOperation(vmi);
      }
    }
    if(this.error === '') {
      if(this.sym_stack < 1) {
        this.error = 'Missing operand';
      } else if(this.sym_stack > 1) {
        this.error = 'Missing operator';
      } else if(this.concatenating) {
        this.error = 'Invalid parameter list';
      }
    }
    if(this.TRACE || DEBUGGING) console.log('PARSED', this.ownerName, ':',
        this.expr, this.code);
  }

} // END of class ExpressionParser


// CLASS VirtualMachine
class VirtualMachine {
  constructor() {
    // Set user name to default as configured in file `linny-r-config.js`
    // This will be an empty string for local host servers
    this.solver_user = SOLVER.user_id;
    // NOTE: if not empty, then authentication is needed
    if(this.solver_user) {
      // If URL contains ?u=, set user name to the passed parameter
      let url = decodeURI(window.location.href);
      // NOTE: trim cache buster suffix that may have been added
      if(url.indexOf('?x=') > 0) url = url.split('?x=')[0].trim();
      if(url.indexOf('?u=') > 0) {
        this.solver_user = url.split('?u=')[1].trim();
      }
    }
    // NOTE: if not null, the callback function is called when the VM has
    // finished a run; this is used by the console version of Linny-R
    this.callback = null;
    // Solver limits may be set in file `linny-r-config.js` (0 => unlimited)
    this.max_solver_time = SOLVER.max_solver_time;
    this.max_blocks = SOLVER.max_nr_of_blocks;
    this.max_tableau_size = SOLVER.max_tableau_size;
    // Standard variables: array of tuples [type, object]
    this.variables = [];
    // Indices for special types
    this.int_var_indices = [];
    this.bin_var_indices = [];
    this.sec_var_indices = [];
    this.sos_var_indices = [];
    this.paced_var_indices = [];
    this.fixed_var_indices = [];
    // Chunk variables: also an array of tuples [type, object], but
    // so far, type is always HI (highest increment); object can be
    // a process or a product
    this.chunk_variables = [];
    // Array for VM instructions
    this.code = [];
    // The Simplex tableau: matrix, rhs and ct will have same length
    this.matrix = [];
    this.right_hand_side = [];
    this.constraint_types = [];
    // String to hold lines of (solver-dependent) model equations
    this.lines = '';
    // String specifying a numeric issue (empty if none)
    this.numeric_issue = '';
    // Warnings are stored in a list to permit browsing through them
    this.issue_list = [];
    // The call stack tracks evaluation of "nested" expression variables
    this.call_stack = [];
    this.block_count = 0;
    // Sequence of round numbers (set by default or as experiment parameter)
    this.round_sequence = '';
    // NOTE: current round is index in round sequence
    this.current_round = 0;
    // Add arrays for solver results per block
    this.round_times = [];
    this.round_secs = [];
    this.solver_times = [];
    this.solver_secs = [];
    this.messages = [];
    this.equations = [];
    // Default texts to display for (still) empty results
    this.no_messages = '(no messages)';
    this.no_variables = '(no variables)';
    this.no_equations = '(select block in progress bar)';

    // Floating-point constants used in calculations
    // Meaningful solver results are assumed to lie wihin reasonable bounds.
    // Extreme absolute values (10^25 and above) are used to signal particular
    // outcomes. This 10^25 limit is used because the default MILP solver
    // LP_solve considers a problem to be unbounded if decision variables
    // reach +INF (1e+30) or -INF (-1e+30), and a solution inaccurate if
    // extreme values get too close to +/-INF. The higher values have been
    // chosen arbitrarily.
    this.PLUS_INFINITY = 1e+25;
    this.MINUS_INFINITY = -1e+25;
    this.BEYOND_PLUS_INFINITY = 1e+35;
    this.BEYOND_MINUS_INFINITY = -1e+35;
    this.SOLVER_PLUS_INFINITY = 1e+30;
    this.SOLVER_MINUS_INFINITY = -1e+30;
    // NOTE: below the "near zero" limit, a number is considered zero
    // (this is to timely detect division-by-zero errors)
    this.NEAR_ZERO = 1e-10;
    // Use a specific constant smaller than near-zero to denote "no cost"
    // to differentiate "no cost" form cost prices that really are 0
    this.NO_COST = 0.987654321e-10;

    // NOTE: allow for an accuracy margin: stocks may differ 0.1%  from their
    // target without displaying them in red or blue to signal shortage or surplus
    this.SIG_DIF_LIMIT = 0.001;
    this.SIG_DIF_FROM_ZERO = 1e-6;
    // On/off threshold is used to differentiate between level = 0 and still "ON"
    // (will be displayed as +0)
    this.ON_OFF_THRESHOLD = 1.5e-4;
    // Limit for upper bounds beyond which binaries cannot be computed correctly
    this.MEGA_UPPER_BOUND = 1e6;
    // Limit slack penalty to one order of magnitude below +INF
    this.MAX_SLACK_PENALTY = 0.1 * this.PLUS_INFINITY;
  
    // VM constants for specifying the type of cash flow operation
    this.CONSUME = 0;
    this.PRODUCE = 1;
    this.ONE_C = 2;
    this.TWO_X = 3;
    this.THREE_X = 4;
    this.SPIN_RES = 5;
    this.PEAK_INC = 6;
    // Array of corrsponding strings for more readable debugging information
    this.CF_CONSTANTS = ['CONSUME', 'PRODUCE', 'ONE_C', 'TWO_X',
        'THREE_X', 'SPIN_RES'];
    
    // Constraint cost price transfer direction
    this.SOC_X_Y = 1;
    this.SOC_Y_X = -1;

    // Link multiplier type numbers
    // NOTE: do *NOT* change existing values, as this will cause legacy issues!!
    this.LM_LEVEL = 0; // No symbol
    this.LM_THROUGHPUT = 1; // Symbol: two parallel right-pointing arrows
    this.LM_INCREASE = 2; // Symbol: Delta
    this.LM_SUM = 3; // Symbol: Sigma
    this.LM_MEAN = 4; // Symbol: mu
    this.LM_STARTUP = 5; // Symbol: thick chevron up
    this.LM_POSITIVE = 6; // Symbol: +
    this.LM_ZERO = 7; // Symbol: 0
    this.LM_SPINNING_RESERVE = 8; // Symbol: left-up curved arrow
    this.LM_FIRST_COMMIT = 9; // Symbol: hollow asterisk
    this.LM_SHUTDOWN = 10; // Symbol: thick chevron down
    this.LM_PEAK_INC = 11; // Symbol: plus inside triangle ("peak-plus")
    // List of link multipliers that require binary ON/OFF variables
    this.LM_NEEDING_ON_OFF = [5, 6, 7, 8, 9, 10];
    this.LM_SYMBOLS = ['', '\u21C9', '\u0394', '\u03A3', '\u03BC', '\u25B2',
        '+', '0', '\u2934', '\u2732', '\u25BC', '\u2A39'];
    
    // VM max. expression stack size
    this.MAX_STACK = 200;

    // Base penalty of 10 is high relative to the (scaled) coefficients of the
    // cash flows in the objective function (typically +/- 1)
    this.BASE_PENALTY = 10;
    // Peak variable penalty is added to make solver choose the *smallest*
    // value that is greater than or equal to X[t] for all t as "peak value"
    this.PEAK_VAR_PENALTY = 0.01;
  
    // NOTE: the VM uses numbers >> +INF to denote special computation results
    this.EXCEPTION = 1e+36; // to test for any exceptional value
    this.UNDEFINED = 1e+37; // to denote "unspecified by the user"
    this.NOT_COMPUTED = 1e+38; // initial value for VM variables (to distinguish from UNDEFINED)
    this.COMPUTING = 1e+39; // used by the VM to implement lazy evaluation
  
    // NOTES:
    // (1) computation errors are signalled by NEGATIVE values << -10^35
    // (2) JavaScript exponents can go up to +/- 308 (IEEE 754 standard)
    // (3) when adding/modifying these values, ALSO update the VM methods for
    //     representing these values as human-readable strings!
    
    this.ERROR = -1e+40; // Any lower value indicates a computation error
    this.CYCLIC = -1e+41;
    this.DIV_ZERO = -1e+42;
    this.BAD_CALC = -1e+43;
    this.ARRAY_INDEX = -1e+44;
    this.BAD_REF = -1e+45;
    this.UNDERFLOW = -1e+46;
    this.OVERFLOW = -1e+47;
    this.INVALID = -1e+48;
    this.PARAMS = -1e+49;
    this.UNKNOWN_ERROR = -1e+50; // Most severe error must have lowest value
  
    this.error_codes = [
      this.ERROR, this.CYCLIC, this.DIV_ZERO, this.BAD_CALC, this.ARRAY_INDEX,
      this.BAD_REF, this.UNDERFLOW, this.OVERFLOW, this.INVALID, this.PARAMS,
      this.UNKNOWN_ERROR, this.UNDEFINED, this.NOT_COMPUTED, this.COMPUTING];
    
    // Prefix for warning messages that are logged in the monitor
    this.WARNING = '-- Warning: ';

    // Solver constants indicating constraint type
    // NOTE: these correspond to the codes used by LP_solve; when generating
    // MPS files, other constants are used
    this.FR = 0;
    this.LE = 1;
    this.GE = 2;
    this.EQ = 3;
    
    this.constraint_codes = ['FR', 'LE', 'GE', 'EQ'];
    this.constraint_symbols = ['', '<=', '>=', '='];
    this.constraint_letters = ['N', 'L', 'G', 'E'];

    // Standard time unit conversion to hours (NOTE: ignore leap years).
    this.time_unit_values = {
      'year': 8760, 'week': 168, 'day': 24,
      'hour': 1, 'minute': 1/60, 'second': 1/3600
    };
    // More or less standard time unit abbreviations.
    // NOTE: minute is abbreviated to `m` to remain consistent with the constants
    // that can be used in expressions. There, `min` already denotes the "minimum"
    // operator.
    this.time_unit_shorthand = {
      'year': 'yr', 'week': 'wk', 'day': 'd',
      'hour': 'h', 'minute': 'm', 'second': 's'
    };
    // Number of rounds limited to 31 because JavaScript performs bitwise
    // operations on 32 bit integers, and the sign bit may be troublesome
    this.max_rounds = 31;
    this.round_letters = '?abcdefghijklmnopqrstuvwxyzABCDE';
    // Standard 1-letter codes for Linny-R entities
    this.entity_names = {
      A: 'actor',
      B: 'constraint',
      C: 'cluster',
      D: 'dataset',
      E: 'equation',
      L: 'link',
      P: 'process',
      Q: 'product'
    };
    this.entity_letters = 'ABCDELPQ';
    // Standard attributes of Linny-R entities
    this.attribute_names = {
      'LB':  'lower bound',
      'UB':  'upper bound',
      'IL':  'initial level',
      'LCF': 'level change frequency',
      'L':   'level',
      'P':   'price',
      'CP':  'cost price',
      'HCP': 'highest cost price',
      'CF':  'cash flow',
      'CI':  'cash in',
      'CO':  'cash out',
      'W':   'weight',
      'R':   'relative rate',
      'D':   'delay',
      'F':   'flow',
      'SOC': 'share of cost',
      'A':   'active'
    };
    // NOTE: defaults are level (L), link flow (F), cluster cash flow (CF),
    // actor cash flow (CF); dataset value (no attribute)
    // NOTE: exogenous properties first, then the computed properties
    this.process_attr = ['LB', 'UB', 'IL', 'LCF', 'L', 'CI', 'CO', 'CF', 'CP'];
    this.product_attr = ['LB', 'UB', 'IL', 'P', 'L', 'CP', 'HCP'];
    this.cluster_attr = ['CI', 'CO', 'CF'];
    this.link_attr = ['R', 'D', 'SOC', 'F'];
    this.constraint_attr = ['SOC', 'A'];
    this.actor_attr = ['W', 'CI', 'CO', 'CF'];
    // Only expression attributes can be used for sensitivity analysis
    this.expression_attr = ['LB', 'UB', 'IL', 'LCF', 'P', 'R', 'D', 'W'];
    // Attributes per entity type letter
    this.attribute_codes = {
      A: this.actor_attr,
      B: this.constraint_attr,
      C: this.cluster_attr,
      D: ['DSM'], // ("dataset modifier" -- placeholder value, not used)
      E: ['X'],   // ("expression" -- placeholder value, not used)
      L: this.link_attr,
      P: this.process_attr,
      Q: this.product_attr
    };
    this.entity_attribute_names = {};
    for(let i = 0; i < this.entity_letters.length; i++) {
      const
          el = this.entity_letters.charAt(i),
          ac = this.attribute_codes[el];
      this.entity_attribute_names[el] = [];
      for(let j = 0; j < ac.length; j++) {
        this.entity_attribute_names[el].push(ac[j]);
      }
    }
    // Level-based attributes are computed only AFTER optimization
    this.level_based_attr = ['L', 'CP',  'HCP', 'CF', 'CI', 'CO', 'F', 'A'];
    this.object_types = ['Process', 'Product', 'Cluster', 'Link', 'Constraint',
        'Actor', 'Dataset', 'Equation'];
    this.type_attributes = [this.process_attr, this.product_attr,
        this.cluster_attr, this.link_attr, this.constraint_attr,
        this.actor_attr, [], []];
    // Statistics that can be calculated for sets of variables 
    this.statistic_operators =
      ['MAX', 'MEAN', 'MIN', 'N', 'SD', 'SUM', 'VAR',
       'MAXNZ', 'MEANNZ', 'MINNZ', 'NNZ', 'SDNZ', 'SUMNZ', 'VARNZ'];
    // Statistics that can be calculated for outcomes and experiment run results
    this.outcome_statistics =
      ['LAST', 'MAX', 'MEAN', 'MIN', 'N', 'NZ', 'SD', 'SUM', 'VAR'];
    }

  reset() {
    // Resets the virtual machine so that it can execute the model again
    // First: reset the expression attributes of all model entities
    MODEL.resetExpressions();
    // Clear slack use information for all constraints
    for(let k in MODEL.constraints) if(MODEL.constraints.hasOwnProperty(k)) {
      MODEL.constraints[k].slack_info = {};
    }
    // Likewise, clear slack use information for all clusters
    for(let k in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(k)) {
      MODEL.clusters[k].slack_info = {};
    }
    // Clear the expression call stack -- used only for diagnostics
    this.call_stack.length = 0;
    // The out-of-bounds properties are set when the ARRAY_INDEX error occurs
    this.out_of_bounds_array = '';
    this.out_of_bounds_msg = '';
    MODEL.set_up = false;
    // Let the model know that it should no longer display results in the graph 
    MODEL.solved = false;
    // "block start" is the first time step (relative to start) of the
    // optimization block 
    this.block_start = 0; 
    // "chunk length" is the number of time steps to solve
    // (block length + look-ahead)
    this.chunk_length = MODEL.block_length + MODEL.look_ahead;
    // Number of blocks is at least 1, and is based on the simulation period
    // (not MODEL.runLength!) divided by the block length (without look-ahead)
    this.nr_of_blocks = Math.ceil(
        (MODEL.end_period - MODEL.start_period + 1) / MODEL.block_length);

    // EXAMPLE: simulation period of 55 time steps, and optimization period of
    // 10 time steps => 6 blocks of 10, and chunk length = block length = 10
    // if no look-ahead.
    // But if look-ahead = 8, then STILL 6 blocks, but now the *chunks* have
    // 18 time steps, with the 5th *chunk* covering t=41 - t=58. This is already
    // beyond the end of the simulation period (t=55), but with insufficient
    // look-ahead (3), hence the 6th block covering t=51 - t=68, of which only
    // the first five time step results will be used.

    // Initialize error counters (error count will be reset to 0 for each block)
    this.error_count = 0;
    this.block_issues = 0;
    // Clear issue list with warnings and hide issue panel
    this.issue_list.length = 0;
    this.issue_index = -1;
    UI.updateIssuePanel();
    // NOTE: special tracking of potential solver license errors
    this.license_expired = 0;
    // Reset solver result arrays
    this.round_times.length = 0;
    this.solver_times.length = 0;
    this.round_secs.length = 0;
    this.solver_secs.length = 0;
    this.messages.length = 0;
    this.equations.length = 0;
    // Initialize arrays to the expected number of blocks so that values can
    // be stored asynchronously
    for(let i = 0; i < this.nr_of_blocks; i++) {
      this.solver_times.push(0);
      this.messages.push(this.no_messages);
      this.equations.push(this.no_equations);
    }
    // Reset the (graphical) controller
    MONITOR.reset();
    // Solver license expiry date will be set to ['YYYYMMDD'], or [] if none
    this.license_expires = [];
    this.block_count = 1;
    // Use default block sequence unless it has been set
    if(MODEL.round_sequence === '') {
      this.round_sequence = this.round_letters.slice(1, MODEL.rounds + 1); 
    } else {
      this.round_sequence = MODEL.round_sequence;
    }
    this.current_round = 0;
    // Set the current time step, relative to start
    // (i.e., t = 0 corresponds with start)
    this.t = 0;
    // Prepare for halt
    this.halted = false;
    UI.readyToSolve();
  }

  errorMessage(n) {
    // VM errors are very big NEGATIVE numbers, so start comparing `n`
    // with the most negative one to return the correct message
    if(n <= this.UNKNOWN_ERROR) return 'Unknown error';
    if(n <= this.PARAMS) return 'Invalid (number of) parameters';
    if(n <= this.INVALID) return 'Invalid expression';
    if(n <= this.OVERFLOW) return 'Stack overflow';
    if(n <= this.UNDERFLOW) return 'Stack underflow';
    if(n <= this.BAD_REF) return 'Reference to unknown entity';
    if(n <= this.ARRAY_INDEX) return 'Array index out of bounds';
    if(n <= this.BAD_CALC) return 'Invalid mathematical operation';
    if(n <= this.DIV_ZERO) return 'Division by zero';
    if(n <= this.CYCLIC) return 'Cyclic reference';
    if(n <= this.ERROR) return 'Unspecified error';
    // Large positive values denote exceptions
    if(n >= this.COMPUTING) return 'Cyclic reference while computing';
    if(n >= this.NOT_COMPUTED) return 'Variable or expression not computed';
    if(n >= this.UNDEFINED) return 'Undefined variable or expression';
    return n;
  }
  
  specialValue(n) {
    // Returns [FALSE, n] if number n is a NOT a special value,
    // otherwise [TRUE, string] with string a readable representation
    // of Virtual Machine error values and other special values
    // VM errors are very big NEGATIVE numbers, so start comparing `n`
    // with the most negative error code
    if(n <= this.UNKNOWN_ERROR) return [true, '#ERROR?'];
    if(n <= this.PARAMS) return [true, '#PARAMS'];
    if(n <= this.INVALID) return [true, '#INVALID'];
    if(n <= this.OVERFLOW) return [true, '#STACK+'];
    if(n <= this.UNDERFLOW) return [true, '#STACK-'];
    if(n <= this.BAD_REF) return [true, '#REF?'];
    if(n <= this.ARRAY_INDEX) return [true, '#INDEX!'];
    if(n <= this.BAD_CALC) return [true, '#VALUE!'];
    if(n <= this.DIV_ZERO) return [true, '#DIV0!'];
    if(n <= this.CYCLIC) return [true, '#CYCLE!'];
    // Any other number less than or equal to 10^30 is considered as
    // minus infinity
    if(n <= this.MINUS_INFINITY) return [true, '-\u221E'];
    // Other special values are very big POSITIVE numbers, so start
    // comparing `n` with the highest value
    if(n >= this.COMPUTING) return [true, '\u25A6']; // Checkered square
    // NOTE: prettier circled bold X 2BBF does not display on macOS !!
    if(n >= this.NOT_COMPUTED) return [true, '\u2297']; // Circled X
    if(n >= this.UNDEFINED) return [true, '\u2047']; // Double question mark ??
    if(n >= this.PLUS_INFINITY) return [true, '\u221E'];
    if(n === this.NO_COST) return [true, '\u00A2']; // c-slash (cent symbol)
    return [false, n];
  }
  
  sig2Dig(n) {
    // Returns number `n` formatted so as to show 2-3 significant digits
    // NOTE: as `n` should be a number, a warning sign will typically
    // indicate a bug in the software
    if(n === undefined) return '\u26A0'; // Warning sign
    const sv = this.specialValue(n);
    // If `n` has a special value, return its representation
    if(sv[0]) return sv[1];
    const a = Math.abs(n);
    // Signal small differences from true 0
    if(n !== 0 && a < 0.0005) return n > 0 ? '+0' : '-0';
    if(a >= 999999.5) return n.toPrecision(2);
    if(Math.abs(a-Math.round(a)) < 0.05) return Math.round(n);
    if(a < 1) return Math.round(n*100) / 100;
    if(a < 10) return Math.round(n*10) / 10;
    if(a < 100) return Math.round(n*10) / 10;
    return Math.round(n);
  }
  
  sig4Dig(n) {
    // Returns number `n` formatted so as to show 4-5 significant digits
    // NOTE: as `n` should be a number, a warning sign will typically
    // indicate a bug in the software
    if(n === undefined || isNaN(n)) return '\u26A0';
    const sv = this.specialValue(n); 
    // If `n` has a special value, return its representation
    if(sv[0]) return sv[1];
    const a = Math.abs(n);
    // Signal small differences from true 0
    if(n !== 0 && a < 0.0005) return n > 0 ? '+0' : '-0';
    if(a >= 9999995) return n.toPrecision(4);
    if(Math.abs(a-Math.round(a)) < 0.0005) return Math.round(n);
    if(a < 1) return Math.round(n*10000) / 10000;
    if(a < 10) return Math.round(n*1000) / 1000;
    if(a < 100) return Math.round(n*100) / 100;
    if(a < 1000) return Math.round(n*10) / 10;
    return Math.round(n);
  }
  
  //
  // Vector scaling methods for datasets and experiment run results
  //
  
  keepException(test, result) {
    // Returns result only when test is *not* an exceptional value
    if(test >= VM.MINUS_INFINITY && test <= VM.PLUS_INFINITY) return result;
    // Otherwise, return the exceptional value
    return test;
  }
  
  scaleDataToVector(data, vector, ddt, vdt, vl=0, start=1, fill=VM.UNDEFINED,
      periodic=false, method='nearest') {
    // Converts array `data` with time step duration `ddt` to a vector with
    // time step duration `vdt` with length `vl`, assuming that data[0]
    // corresponds to vector[start] using the specified method, and filling out
    // with `fill` unless `periodic` is TRUE
    // Initialize the vector
    // NOTE: do nothing if vector or data are not arrays 
    if(!(Array.isArray(vector) && Array.isArray(data))) return;
    vector.length = vl + 1;
    vector.fill(fill);
    const dl = data.length;
    // No data? then return the vector with its `fill` values
    if(!dl) return;
    // Also compute the array lengths for data and model
    // NOTE: times are on "real" time scale, counting from t=1 onwards
    let period_length = dl * ddt, // no data beyond this time unless periodic
        t_end = (start + vl) * vdt, // last time needing data for simulation
        n = vl; // number of elements to calculate (by default: vector length)
    if(!periodic) {
      // If dataset is not periodic and ends before the vector's end time,
      // compute the vector only to the dataset end time
      if(t_end > period_length) {
        t_end = period_length;
        // This then means fewer vector time steps to compute the vector for
        n = Math.floor((t_end - start) / vdt) + 1;
      }
    }
    // NOTE: `vts` (vector time step), and `dts` (data time step) are indices
    // in the respective arrays
    let dts = 1,
        vts = 1;
    // The "use nearest corresponding data point" does not aggregate
    if(method === 'nearest') {
      // NOTE: data[0] by definition corresponds to vector time t=1, whereas
      // vector[0] must contain the initial value (start - 1)
      // NOTE: t is time (*unrounded* step) at VECTOR time scale
      // For "nearest", start with data that corresponds to just below half a
      // vector time step before the first time step on the VECTOR time scale
      let t = (start - 0.501) * vdt;
      // t_end += 0.499 * vdt;
      // NOTE: always modulo data length to anticipate periodic; for the
      // algorithm used for NEAREST, this works also if *not* periodic
      dts = (Math.floor(t / ddt)) % dl;  
  /*
  console.log(method, start, t, t_end, 'ddt vdt', ddt, vdt, 'dts vts vl',
              dts, vts, vl, 'DATA', data.toString(), 'V', vector.toString());
  */
      // NOTE: for vector[0], use one data time step earlier
      if(dts > 0) {
        vector[0] = data[dts - 1];
      } else if(periodic) {
        vector[0] = data[dl - 1];
      } else {
        vector[0] = fill;
      }
      while(t < t_end) {
        // Calculate the index of the nearest data value
        dts = (Math.floor(t / ddt)) % dl;
        // Copy the data
        vector[vts] = data[dts];
        // Increase the vector time by 1 vector time step length
        t += vdt;
        vts++;
      }
      // Clip vector to desired length, as while loop may go 1 step too far
      vector.length = vl + 1;
      return;
    }
    // The other methods consider ALL data.
    let maxv,
        vtf, // vector time fraction
        dtf, // data time fraction
        ps = 0,
        v = 0;
    // Set `dts` to the index corresponding to the first time step of the
    // simulation period
    dts = Math.floor((start - 1) * vdt / ddt);
    // Set `max_dts` to the # datapoints to be used (unlimited when periodic,
    // otherwise the length of the time series minus the start time)
    let n_dts = 0,
        max_dts = (periodic ? Number.MAX_SAFE_INTEGER : dl - dts);
    // Prepare for periodicity (this will not affect result if not periodic)
    dts %= dl;
    if(ddt <= vdt) {
      // If dataset has shorter time step, aggregate multiple data
      // values per model time step
      // Measure time as fraction of one VECTOR time step...
      vtf = 0;
      // ... while adding smaller fractions of one DATA time step
      dtf = ddt / vdt;
      // Outer loop: proceed in vector time steps
      while(vts <= n + 1 && n_dts <= max_dts) {
        // Initialize MAX value.
        maxv = data[dts];
        // Inner loop: add data time steps till they fill a vector time step
        while(vtf < 1 && n_dts <= max_dts) {
          // NOTE: remaining part (1 - vtf) may be shorter than 1 dts
          v = this.keepException(data[dts], v + data[dts] * Math.min(dtf, 1 - vtf));
          vtf += dtf;
          // Store the last data step as "previous step" for later use
          ps = dts;
          dts = (dts + 1) % dl;
          n_dts++;
          // NOW take the maximum, as new dts still pertains to this vts
          maxv = this.keepException(data[dts], Math.max(maxv, data[dts]));
        }
        if(method === 'max') {
          vector[vts] = maxv;
        } else if(method === 'w-sum') {
          // `v` holds average, so divide it by data time fraction
          vector[vts] = this.keepException(v, v / dtf);
        } else {
          // Store the average
          vector[vts] = v;
        }
        // Calculate the "overshoot" beyond 1 vector time step
        vtf -= 1;
        // Carry over this "remainder" to the next vector time step
        // NOTE: It must be multiplied by the PREVIOUS data time step
        v = this.keepException(data[ps], vtf * data[ps]);
        vts++;
      }
    } else {
      // The dataset has the longer time step, hence disaggregate data
      // values over multiple shorter vector time steps. 
      // Measure time as fraction of one DATA time step...
      dtf = 0;
      // ... while adding smaller fractions of one MODEL time step.
      vtf = vdt / ddt;
      // Outer loop: AGAIN proceed in vector time steps.
  /*
  console.log(method, start, 'dts vts vl', dts, vts, vl, 'n_dts max_dts', n_dts, max_dts, data, vector);
  */
      while(vts <= n && n_dts <= max_dts) {
        // Keep using the same data value.
        v = data[dts];
        // Inner loop: add VECTOR time steps till they fill a data time step
        while(dtf < 1 && vts <= vl) {
          vector[vts] = v;
          dtf += vtf;
          vts++;
        }
        // Calculate the "overshoot" beyond 1 data time step.
        dtf -= 1;
        // Consider next data time step value only if significant overshoot
        if(dtf > VM.NEAR_ZERO) {
          if(method === 'max') {
            // Move to the next data value...
            dts = (dts + 1) % dl;
            // ... but use this value only if it is larger.
            if(data[dts] > v) vector[vts - 1] = data[dts];
          } else {
            // Calculate "overshoot" as percentage of 1 vector time step
            const
                perc = dtf / vtf,
                prev = vector[vts - 1];
            // Keep (1 - % overshoot) of the last set value...
            vector[vts - 1] = this.keepException(prev, prev * (1 - perc));
            // ... move to the next data value...
            dts = (dts + 1) % dl;
            // ... and add the % overshoot times the new data value
            vector[vts - 1] = this.keepException(prev, prev + perc * data[dts]);
          }
        } else {
          // Just move to the next data value
          dts = (dts + 1) % dl;
        }
        // Increment the number of data values used
        n_dts++;
      }
      // When data is not "per time", scale it
      if(method === 'w-sum') {
        for(vts = 0; vts <= n; vts++) {
          vector[vts] = this.keepException(vector[vts], vector[vts] * vtf);
        }
      }
  /*
  console.log(method, 'vts vl vtf', vts, vl, vtf, 'n_dts max_dts', n_dts, max_dts, data, vector);
  */
    }
    return;
  }
  
  get lastRound() {
    // Returns the last round number in the round sequence
    const index = this.round_sequence.length - 1;
    if(index < 0) return '';
    return this.round_sequence[index];
  }
  
  get supRound() {
    // NOTE: do not show round number as superscript of the step number if the
    // only round in the sequence is round a
    if(MODEL.rounds < 1 || this.round_sequence === 'a') {
      return '';
    } else {
      return '<sup style="font-size: 8pt; font-style: italic">' +
        this.round_sequence[this.current_round] + '</sup>';
    }
  }
  
  get blockWithRound() {
    if(MODEL.rounds < 1 || this.round_sequence === 'a') {
      return this.block_count;
    } else {
      return this.block_count + this.round_sequence[this.current_round];
    }
  }
  
  logCallStack(t) {
    // Similar to showCallStack, but simpler, and output only to console
    console.log('Call stack:', this.call_stack.slice());
    const csl = this.call_stack.length;
    console.log(`ERROR at t=${t}: ` +
        this.errorMessage(this.call_stack[csl - 1].vector[t]));
    // Make separate lists of variable names and their expressions
    const
        vlist = [],
        xlist = [];
    for(let i = 0; i < csl; i++) {
      const x = this.call_stack[i];
      vlist.push(x.object.displayName + '|' + x.attribute);
      // Trim spaces around all object-attribute separators in the expression
      xlist.push(x.text.replace(/\s*\|\s*/g, '|'));
    }
    // Start without indentation
    let pad = '';
    // First log the variable being computed
    console.log('Computing:', vlist[0]);
    // Then iterate upwards over the call stack
    for(let i = 0; i < vlist.length - 1; i++) {
      // Log the expression, followed by the next computed variable
      console.log(pad + xlist[i] + '\u279C' + vlist[i+1]);
      // Increase indentation
      pad += '   ';
    }
    // Log the last expression
    console.log(pad + xlist[xlist.length - 1]);
  }

  logTrace(trc) {
    // Logs the trace string to the browser console
    if(DEBUGGING) console.log(trc);
  }

  logMessage(block, msg) {
    // Adds a solver message to the list
    // NOTE: block number minus 1, as array is zero-based
    if(this.messages[block - 1] === this.no_messages) {
      this.messages[block - 1] = '';
    }
    this.messages[block - 1] += msg + '\n';
    if(msg.startsWith(this.WARNING)) {
      this.error_count++;
      this.issue_list.push(msg);
    }
    // Show message on console or in Monitor dialog
    MONITOR.logMessage(block, msg);
  }
  
  setRunMessages(n) {
    // Sets the messages and solver times for experiment or SA run `n`
    let r = null;
    if(EXPERIMENT_MANAGER.selected_experiment) {
      if(n < EXPERIMENT_MANAGER.selected_experiment.runs.length) {
        r = EXPERIMENT_MANAGER.selected_experiment.runs[n];
      }
    } else if(n < MODEL.sensitivity_runs.length) {
      r = MODEL.sensitivity_runs[n];
    }
    if(r) {
      this.solver_times.length = 0;
      this.messages.length = 0;
      this.equations.length = 0;
      this.variables.length = 0;
      this.chunk_variables.length = 0;
      this.nr_of_blocks = 0;
      this.block_count = 0;
      MONITOR.clearProgressBar();
      for(let i = 0; i < r.block_messages.length; i++) {
        const
            bm = r.block_messages[i],
            err = (bm.messages.indexOf('Solver status = 0') < 0 ||
                bm.messages.indexOf('Warning') >= 0);
        this.solver_times.push(bm.solver_time);
        this.messages.push(bm.messages);
        this.variables.push(this.no_variables);
        this.equations.push(this.no_equations);
        this.nr_of_blocks++;
        this.block_count++;
        MONITOR.addProgressBlock(this.nr_of_blocks, err, bm.solver_time);
      }
      MONITOR.shown_block = 1;
      MONITOR.updateContent('msg');
    }
  }
  
  startTimer() {
    // Record time of this reset
    this.reset_time = new Date().getTime();
    this.time_stamp = this.reset_time;
    // Activate the timer
    this.timer_id = setInterval(() => MONITOR.updateMonitorTime(), 1000);
  }

  stopTimer() {
    // Deactivate the timer
    clearInterval(this.timer_id);
  }

  get elapsedTime() {
    // Returns seconds since previous "elapsed time" check 
    const ts = this.time_stamp;
    this.time_stamp = new Date().getTime();
    return (this.time_stamp - ts) / 1000;
  }
  
  addVariable(type, obj) {
    // Adds a variable that will need a column in the Simplex tableau
    const index = this.variables.push([type, obj]);
    if((type === 'PL' || type === 'PiL') && obj.level_to_zero) {
      this.sec_var_indices[index] = true;
    }
    if(type === 'I' || type === 'PiL') {
      this.int_var_indices[index] = true;
    } else if('OO|IZ|SU|SD|SO|FC'.indexOf(type) >= 0) {
      this.bin_var_indices[index] = true;
    }
    if(obj instanceof Process && obj.pace > 1) {
      // NOTE: binary variables can be "paced" just like level variables
      this.paced_var_indices[index] = obj.pace;
    }
    // For constraint bound lines, add as many SOS variables as there are
    // points on the bound line
    if(type === 'W1' && obj instanceof BoundLine) {
      const n = obj.points.length;
      for(let i = 2; i <= n; i++) {
        this.variables.push(['W' + i, obj]);
      }
      this.sos_var_indices.push([index, n]);
    }
    return index;
  }
  
  resetVariableIndices(p) {
    // Set all variable indices to -1 ("no such variable") for node `p`
    p.level_var_index = -1;
    p.on_off_var_index = -1;
    p.is_zero_var_index = -1;
    p.start_up_var_index = -1;
    p.shut_down_var_index = -1;
    p.start_up_count_var_index = -1;
    p.suc_on_var_index = -1;
    p.first_commit_var_index = -1;
    p.peak_inc_var_index = -1;
    if(p instanceof Product) {
      p.stock_LE_slack_var_index = -1;
      p.stock_GE_slack_var_index = -1;
    }
  }
  
  addNodeVariables(p) {
    // Add tableau variables for process or product `p`
    // NOTE: every node is represented by at least one variable: its "level"
    // This is done even if a product has no storage capacity, because it
    // simplifies the formulation of product-related (data) constraints
    p.level_var_index = this.addVariable(p.integer_level ? 'PiL': 'PL', p);
    // Some "data-only" link multipliers require additional variables
    if(p.needsOnOffData) {
      p.on_off_var_index = this.addVariable('OO', p);
      p.is_zero_var_index = this.addVariable('IZ', p);
      // To detect startup, one more variable is needed
      if(p.needsStartUpData) {
        p.start_up_var_index = this.addVariable('SU', p);
        // To detect first commit, three more variables are needed
        if(p.needsFirstCommitData) {
          p.start_up_count_var_index = this.addVariable('SC', p);
          p.suc_on_var_index = this.addVariable('SO', p);
          p.first_commit_var_index = this.addVariable('FC', p);
        }
      }
      // To detect shut-down, one more variable is needed
      if(p.needsShutDownData) {
        p.shut_down_var_index = this.addVariable('SD', p);
      }
    }
    // NOTES:
    // (1) Processes have NO slack variables, because sufficient slack is
    //     provided by adding slack variables to products; these slack
    //     variables will have high cost penalty values in the objective
    //     function, to serve as "last resort" to still obtain a solution when
    //     the "real" product levels are overconstrained
    // (2) The modeler may selectively disable slack to force the solver to
    //     respect certain constraints; this may result in infeasible MILP
    //     problems; the solver will report this
    if(p instanceof Product && !p.no_slack) {
      p.stock_LE_slack_var_index = this.addVariable('LE', p);
      p.stock_GE_slack_var_index = this.addVariable('GE', p);
    }
  }

  priorValue(tuple, t) {
    // Returns value of a tableau variable calculated for a prior block
    // NOTE: tuple is a [type, object] VM variable specification 
    const
        type = tuple[0],
        obj = tuple[1];
    if(type.indexOf('-peak') > 0) {
      // Peak level variables have an array as node property
      const c = Math.trunc(t / this.block_length);
      if(type.startsWith('b')) return obj.b_peak_inc[c];
      return obj.la_peak_inc[c];
    }
    const prior_level = obj.actualLevel(t);
    if(type === 'OO') return prior_level > 0 ? 1 : 0;
    if(type === 'IZ') return prior_level === 0 ? 1 : 0;
    // Start-up at time t entails that t is in the list of start-up time steps
    if(type === 'SU') return obj.start_ups.indexOf(t) < 0 ? 0 : 1;
    // Shut-down at time t entails that t is in the list of shut-down time steps
    if(type === 'SD') return obj.shut_downs.indexOf(t) < 0 ? 0 : 1;
    if(['SO', 'SC', 'FC'].indexOf(type) >= 0) {
      let l = obj.start_ups.length;
      if(l === 0) return 0;
      if(type === 'FC') return obj.start_ups[0] === t ? 1 : 0;
      while(l > 0 && obj.start_ups[l-1] > t) l--;
      if(type === 'SC') return l;
      return l > 0 ? 1 : 0;
    }
    return prior_level;
  }

  variablesLegend(block) {
    // Returns a string with each variable code and full name on a separate line
    const
        vcnt = this.variables.length,
        z = vcnt.toString().length;
    if(vcnt == 0) return '(no variables)';
    let l = '';
    for(let i = 0; i < vcnt; i++) {
      const obj = this.variables[i][1];
      let v = 'X' + (i+1).toString().padStart(z, '0');
      v += '     '.slice(v.length) + obj.displayName;
      const p = (obj instanceof Process && obj.pace > 1 ? ' 1/' + obj.pace : '');
      l += v + ' [' + this.variables[i][0] + p + ']\n';
    }
    if(this.chunk_variables.length > 0) {
      // NOTE: chunk offset for last block may be lower than standard
      const chof = (block >= this.nr_of_blocks ? this.chunk_offset :
          this.cols * this.chunk_length + 1);
      for(let i = 0; i < this.chunk_variables.length; i++) {
        const
            obj = this.chunk_variables[i][1],
            // NOTE: chunk offset takes into account that indices are 0-based
            cvi = chof + i;
        let v = 'X' + cvi.toString().padStart(z, '0');
        v += '     '.slice(v.length) + obj.displayName;
        l += v + ' [' + this.chunk_variables[i][0] + ']\n';
      }
    }
    return l;
  }
  
  setBoundConstraints(p) {
    // Sets LB and UB constraints for product `p`
    // NOTE: this method affects the VM coefficient vector, so save it if needed!
    const
        vi = p.level_var_index,
        lesvi = p.stock_LE_slack_var_index,
        gesvi = p.stock_GE_slack_var_index,
        notsrc = !p.isSourceNode,
        notsnk = !p.isSinkNode;
    this.code.push(
      // Set coefficients vector to 0
      [VMI_clear_coefficients, null],
      // Always add the index of the variable-to-be-constrained
      [VMI_add_const_to_coefficient, [vi, 1]]
    );
    // Get the lower bound as number (static LB) or expression (dynamic LB)
    // NOTE: by default, LB = 0 and UB = +INF
    let l = 0,
        u = VM.PLUS_INFINITY;
    if(p.hasBounds) {
      if(p.lower_bound.defined) {
        if(p.lower_bound.isStatic) {
          l = p.lower_bound.result(0);
          if(Math.abs(l) <= VM.NEAR_ZERO) l = 0;
        } else {
          l = p.lower_bound;
        }
      }
      // Likewise get the upper bound
      if(p.equal_bounds && p.lower_bound.defined) {
        u = l;
      } else if(p.upper_bound.defined) {
        if(p.upper_bound.isStatic) {
          u = p.upper_bound.result(0);
          if(Math.abs(u) <= VM.NEAR_ZERO) u = 0;
        } else {
          u = p.upper_bound;
        }
      }
    } else {
      // Implicit bounds: if not a source, then LB is set to 0
      if(notsrc) l = 0;
      // If not a sink, UB is set to 0
      if(notsnk) u = 0;
    }
    
    // NOTE: stock constraints must take into account extra inflows
    // (source) or outflows (sink).
    // Check for special case of equal bounds, as then one EQ constraint
    // suffices. This applies if P is a constant ...
    if(p.isConstant) {
      // NOTE: no slack on constants
      // Use the lower bound (number or expression) as RHS
      this.code.push(
        [l instanceof Expression ? VMI_set_var_rhs : VMI_set_const_rhs, l],
        [VMI_add_constraint, VM.EQ]
      );
    // ... or if P is neither source nor sink
    } else if(p.equal_bounds && notsrc && notsnk) {
      if(!p.no_slack) {
        // NOTE: for EQ, both slack variables should be used,
        // having respectively -1 and +1 as coefficients
        this.code.push(
          [VMI_add_const_to_coefficient, [lesvi, -1]],
          [VMI_add_const_to_coefficient, [gesvi, 1]]
        );
      }
      // Use the lower bound (number or expression) as RHS
      this.code.push(
        [l instanceof Expression ? VMI_set_var_rhs : VMI_set_const_rhs, l],
        [VMI_add_constraint, VM.EQ]
      );
    } else {
      // Add lower bound (GE) constraint unless product is a source node
      if(notsrc) {
        if(!p.no_slack) {
          // Add the GE slack index with coefficient +1
          // (so it can INcrease the LHS)
          this.code.push([VMI_add_const_to_coefficient, [gesvi, 1]]);
        }
        // Use the lower bound (number or expression) as RHS
        this.code.push(
          [l instanceof Expression? VMI_set_var_rhs : VMI_set_const_rhs, l],
          [VMI_add_constraint, VM.GE]
        );          
      }
      // Add upper bound (LE) constraint unless product is a sink node
      if(notsnk) {
        if(!p.no_slack) {
          // Add the stock LE index with coefficient -1
          // (so it can DEcrease the LHS)
          this.code.push([VMI_add_const_to_coefficient, [lesvi, -1]]);
        }
        // Use the upper bound (number or expression) as RHS
        this.code.push(
          [u instanceof Expression ? VMI_set_var_rhs : VMI_set_const_rhs, u],
          [VMI_add_constraint, VM.LE]
        );          
      }
    }
  }
  
  setupProblem() {
    // NOTE: The setupProblem() function implements the essential idea of
    // Linny-R! It sets up the VM variable list, and then generates VM code
    // that that, when executed, creates the MILP tableau for a chunk.
    let i, j, k, l, vi, p, c, lbx, ubx;
    // Reset variable arrays and code array
    this.variables.length = 0;
    this.chunk_variables.length = 0;
    this.int_var_indices = [];
    this.bin_var_indices = [];
    this.sec_var_indices = [];
    this.paced_var_indices = [];
    this.fixed_var_indices = [];
    this.sos_var_indices = [];
    this.slack_variables = [[], [], []];
    this.code.length = 0;
    // Initialize fixed variable array: 1 list per round
    for(i = 0; i < MODEL.rounds; i++) {
      this.fixed_var_indices.push([]);
    }
    
    // Just in case: re-determine which entities can be ignored
    MODEL.inferIgnoredEntities();
    const n = Object.keys(MODEL.ignored_entities).length;
    if(n > 0) {
      this.logMessage(this.block_count,
          pluralS(n, 'entity', 'entities') + ' will be ignored');
    }

    // FIRST: define indices for all variables (index = Simplex tableau column number)

    // Each actor has a variable to compute its cash in and its cash out
    const actor_keys = Object.keys(MODEL.actors).sort();
    for(i = 0; i < actor_keys.length; i++) {
      const a = MODEL.actors[actor_keys[i]];
      a.cash_in_var_index = this.addVariable('CI', a);
      a.cash_out_var_index = this.addVariable('CO', a);
    }
    // Define variable indices for all processes
    const process_keys = Object.keys(MODEL.processes).sort();
    for(i = 0; i < process_keys.length; i++) {
      k = process_keys[i];
      p = MODEL.processes[k];
      this.resetVariableIndices(p);
      if(!MODEL.ignored_entities[k]) this.addNodeVariables(p);
    }
    // Do likewise for all products
    const product_keys = Object.keys(MODEL.products).sort();
    for(i = 0; i < product_keys.length; i++) {
      k = product_keys[i];
      p = MODEL.products[k];
      this.resetVariableIndices(p);
      if(!MODEL.ignored_entities[k]) this.addNodeVariables(p);
    }

    // Constraints having "active" bound lines (i.e., having either NO
    // selectors or selectors that match the current experiment run)
    // must have as many special ordered sets (SOS2) variables w[i] as
    // they have points. These N variables must always add up to 1, so
    // this constraint will be added:
    //   w[1] + ... + w[N] = 1
    // To effectuate an EQ constraint that puts Y on the bound line for
    // any X, where the bound line points are (px[i], py[i]) for i = 1,
    // ..., N, X must be bound to the w[i] as follows:
    //   X = px[1]*w[1] + ... + px[N]*w[N] (no slack needed here)
    // while Y must be bound to the w[i] as follows:
    //   Y = py[1]*w[1] + ... + py[N]*w[N] + GE slack - LE slack
    // The slack variables prevent that the solver will consider an
    // overconstrained model "infeasible". EQ bound lines have 2 slack
    // variables, LE and GE bound lines need only 1.
    // NOTE: slack variables are omitted when the "no slack" property
    // of the constraint is set
    const constraint_keys = Object.keys(MODEL.constraints).sort();
    for(i = 0; i < constraint_keys.length; i++) {
      k = constraint_keys[i];
      if(!MODEL.ignored_entities[k]) {
        c = MODEL.constraints[k];
        for(l = 0; l < c.bound_lines.length; l++) {
          const bl = c.bound_lines[l];
          bl.sos_var_indices = [];
          if(bl.isActive && bl.constrainsY) {
            // Define SOS2 variables w[i]
            // NOTE: method will add as many as there are points!
            bl.first_sos_var_index = this.addVariable('W1', bl);
            if(!c.no_slack) {
              // Define the slack variable(s) for bound line constraints
              if(bl.type !== VM.GE) {
                bl.LE_slack_var_index = this.addVariable('CLE', bl);
                this.slack_variables[2].push(bl.LE_slack_var_index);
              }
              if(bl.type !== VM.LE) {
                bl.GE_slack_var_index = this.addVariable('CGE', bl);
                this.slack_variables[2].push(bl.GE_slack_var_index);
              }
            }
          }
        }
      }
    }
    
    // Now all variables that get a tableau column in each time step have
    // been defined; next step is to add "chunk variables"
    let cvi = 0;
    // Add *two* chunk variables for processes having a peak increase link
    for(i = 0; i < process_keys.length; i++) {
      k = process_keys[i];
      p = MODEL.processes[k];
      if(!MODEL.ignored_entities[k] && p.needsMaximumData) {
        // "peak increase" for block
        p.peak_inc_var_index = cvi;
        this.chunk_variables.push(['b-peak', p]);
        cvi++;
        // additional "peak increase" for the look-ahead period
        // NOTE: no need to record the second index as it wil allways be
        // equal to block peak index + 1
        this.chunk_variables.push(['la-peak', p]);
        cvi++;
      }
    }
    // Do likewise for such products
    for(i = 0; i < product_keys.length; i++) {
      k = product_keys[i];
      p = MODEL.products[k];
      if(!MODEL.ignored_entities[k] && p.needsMaximumData) {
        p.peak_inc_var_index = cvi;
        this.chunk_variables.push(['b-peak', p]);
        cvi++;
        this.chunk_variables.push(['la-peak', p]);
        cvi++;
      }
    }

    // Now *all* variables have been defined; next step is to set their bounds

    // NOTE: chunk variables of node `p` have LB = 0 and UB = UB of `p`;
    // this is effectuated by the VM "set bounds" instructions at run time

    // NOTE: under normal assumptions (all processes having LB >= 0), bounds on
    // actor cash flow variables need NOT be set because cash IN and cash OUT
    // will then always be >= 0 (solver's default bounds).
    // However, Linny-R does not prohibit negative bounds on processes, nor
    // negative rates on links. To be consistently permissive, cash IN and
    // cash OUT of all actors are both allowed to become negative.
    for(i = 0; i < actor_keys.length; i++) {
      const a = MODEL.actors[actor_keys[i]];
      // NOTE: add fourth parameter TRUE to signal that the SOLVER's
      // infinity constants should be used, as this is likely to be more
      // efficient, while cash flows are inferred properties and will not
      // result in an "unbounded problem" error message from the solver
      this.code.push(
          [VMI_set_bounds, [a.cash_in_var_index,
              VM.MINUS_INFINITY, VM.PLUS_INFINITY, true]],
          [VMI_set_bounds, [a.cash_out_var_index,
              VM.MINUS_INFINITY, VM.PLUS_INFINITY, true]]
      );
    }

    // NEXT: Define the bounds for all production level variables
    // NOTE: the VM instructions check dynamically whether the variable index
    // is listed as "fixed" for the round that is being solved
    for(i = 0; i < process_keys.length; i++) {
      k = process_keys[i];
      if(!MODEL.ignored_entities[k]) {
        p = MODEL.processes[k];
        lbx = p.lower_bound;
        // NOTE: if UB = LB, set UB to LB only if LB is defined,
        // because LB expressions default to -INF while UB expressions
        // default to + INF
        ubx = (p.equal_bounds && lbx.defined ? lbx : p.upper_bound);
        if(lbx.isStatic) lbx = lbx.result(0);
        if(ubx.isStatic) ubx = ubx.result(0);
        // NOTE: pass TRUE as fourth parameter to indicate that +INF
        // and -INF can be coded as the infinity values used by the
        // solver, rather than the Linny-R values used to detect
        // unbounded problems
        this.code.push([VMI_set_bounds, [p.level_var_index, lbx, ubx, true]]);
        // Add level variable index to "fixed" list for specified rounds
        const rf = p.actor.round_flags;
        if(rf != 0) {
          // Note: 32-bit integer `b` is used for bit-wise AND
          let b = 1;
          for(j = 0; j < MODEL.rounds; j++) {
            if((rf & b) != 0) {
              this.fixed_var_indices[j][p.level_var_index] = true;
              // @@ TO DO: fix associated binary variables if applicable!
            }
            b *= 2;
          }
        }
      }
    }

    // NEXT: Define the bounds for all stock level variables 
    for(i = 0; i < product_keys.length; i++) {
      k = product_keys[i];
      if(!MODEL.ignored_entities[k]) {
        p = MODEL.products[k];
        // Get index of variable that is constrained by LB and UB 
        vi = p.level_var_index;
        if(p.no_slack) {
          // If no slack, the bound constraints can be set on the
          // variables themselves
          lbx = p.lower_bound;
          // NOTE: if UB = LB, set UB to LB only if LB is defined,
          // because LB expressions default to -INF while UB expressions
          // default to + INF
          ubx = (p.equal_bounds && lbx.defined ? lbx : p.upper_bound);
          if(lbx.isStatic) lbx = lbx.result(0);
          if(ubx.isStatic) ubx = ubx.result(0);
          this.code.push([VMI_set_bounds, [vi, lbx, ubx]]);
        } else {
          // Otherwise, set bounds of stock variable to -INF and +INF,
          // as product constraints will be added later on
          this.code.push([VMI_set_bounds,
              [vi, VM.MINUS_INFINITY, VM.PLUS_INFINITY]]);
        }
      }
    }
    
    // NEXT: Define objective function that maximizes total cash flow

    // NOTE: As of 19 October 2020, the objective function is *explicitly*
    //       calculated as the (weighted) sum of the cash flows of actors
    //       by adding two EQ constraints per actor.

    // NOTE: Each process generates cash flow proportional to its production
    //       level if it produces and/or consumes a product having a price.
    //       Cash flow is negative (cash OUT) if a product is consumed AND has
    //       price > 0, but positive (cash IN) if a product is produced and has
    //       price < 0. Likewise for the other two cases.
    //       To calculate the coefficient for the process variable, the
    //       multiplier rates of the links in and out must be calculated (at
    //       run time when dynamic expressions) such that they will add to the
    //       correct cash flow variable (cash IN or cash OUT) of the actor
    //       "owning" the process.
    //       To achieve this, the VM has (as of 21 October 2020) a special
    //       instruction  VMI_update_cash_coefficient  that operates on two
    //       separate coefficient vectors: one for cash IN and one for cash OUT.
    //       It first calculates the coefficient value (based on link direction,
    //       level, price and rate) and then ADDS it to the process coefficient
    //       in the *cash IN* vector if result > 0, or SUBTRACTS it from the
    //       process coefficient in the *cash OUT* vector if result < 0.
    //       This ensures that all coefficients will be >= 0 for both cash IN
    //       and cash OUT, so that the constraints Cin - a1P1 - ... - anPn = 0
    //       will result in positive values for both flows.
    //       Then in the objective function each actor a will have two variables
    //       contributing the weighted difference + WaCin - WaCout. 
    // NOTE: The VM has a coefficients vector, and VM instructions operate
    //       on this vector. If expressions for process properties are
    //       static, more efficient VM instructions are used.

    // Initially assume "no cash flows for any actor to be considered"
    this.no_cash_flows = true;
    
    // Iterate over all actors to add the cash flow computation constraints
    for(let ai = 0; ai < actor_keys.length; ai++) {
      const a = MODEL.actors[actor_keys[ai]];
      this.code.push([VMI_clear_coefficients, null]);
      for(i = 0; i < process_keys.length; i++) {
        k = process_keys[i];
        if(!MODEL.ignored_entities[k]) {
          const p = MODEL.processes[k];
          // Only consider processes owned by this actor
          if(p.actor === a) {
            // Iterate over links IN, but only consider consumed products having
            // a market price
            for(j = 0; j < p.inputs.length; j++) {
              l = p.inputs[j];
              if(!MODEL.ignored_entities[l.identifier] &&
                  l.from_node.price.defined) {
                if(l.from_node.price.isStatic && l.relative_rate.isStatic) {
                  k = l.from_node.price.result(0) * l.relative_rate.result(0);
                  // NOTE: VMI_update_cash_coefficient has at least 4 arguments:
                  // flow (CONSUME or PRODUCE), type (specifies the number and type
                  // of arguments), the level_var_index of the process, and the
                  // delay.
                  if(Math.abs(k) > VM.NEAR_ZERO) {
                    // Consumption rate & price are static: pass one constant
                    // NOTE: input links cannot have delay, so delay = 0
                    this.code.push([VMI_update_cash_coefficient,
                      [VM.CONSUME, VM.ONE_C, p.level_var_index, 0, k]]);
                  }
                } else {
                  // No further optimization: assume two dynamic expressions
                  // NOTE: input links cannot have delay, so delay = 0
                  this.code.push([VMI_update_cash_coefficient,
                    [VM.CONSUME, VM.TWO_X, p.level_var_index, 0,
                     l.from_node.price, l.relative_rate]]);
                }
              }
            } // END of FOR ALL input links
            
            // Iterate over links OUT, but only consider produced products
            // having a (non-zero) market price
            for(j = 0; j < p.outputs.length; j++) {
              l = p.outputs[j];
              const tnpx = l.to_node.price;
              if(!MODEL.ignored_entities[l.identifier] && tnpx.defined &&
                  !(tnpx.isStatic && Math.abs(tnpx.result(0)) < VM.NEAR_ZERO)) {
                // By default, use the process level as multiplier
                vi = p.level_var_index;
                // For "binary data links", use the correct binary variable instead
                if(l.multiplier === VM.LM_STARTUP) {
                  vi = p.start_up_var_index;
                } else if(l.multiplier === VM.LM_FIRST_COMMIT) {
                  vi = p.first_commit_var_index;
                } else if(l.multiplier === VM.LM_SHUTDOWN) {
                  vi = p.shut_down_var_index;
                } else if(l.multiplier === VM.LM_POSITIVE) {
                  vi = p.on_off_var_index;
                } else if(l.multiplier === VM.LM_ZERO) {
                  vi = p.is_zero_var_index;
                }
                // NOTE: "throughput", "spinning reserve" and "peak increase" are
                // special cases that send a different parameter list
                if(l.multiplier === VM.LM_THROUGHPUT) {
                  // When throughput is read from process Y, calculation
                  // is simple: no delays, so the flow over link `l`
                  // equals the (sum of all Ri) times the level of Y
                  // times the rate of `l`
                  for(k = 0; k < l.from_node.inputs.length; j++) {
                    ll = l.from_node.inputs[k];
                    // NOTE: no attempt for efficiency -- assume that
                    // price and both rates are dynamic
                    this.code.push([VMI_update_cash_coefficient, [
                        VM.PRODUCE, VM.THREE_X, vi, l.flow_delay, tnpx,
                        l.relative_rate, ll.relative_rate]]);
                  }
                } else if(l.multiplier === VM.LM_SPINNING_RESERVE) {
                  // "spinning reserve" equals UB - level if level > 0, or 0
                  // The cash flow then equals ON/OFF * UB * price * rate MINUS
                  // level * price * rate, hence a special instruction type
                  // NOTE: only the ON/OFF variable determines whether there will
                  // be any cash flow, hence it is passed as the primary variable,
                  // and the process level as the secondary variable
                  this.code.push([VMI_update_cash_coefficient, [
                      VM.PRODUCE, VM.SPIN_RES, p.on_off_var_index, l.flow_delay, vi,
                      l.from_node.upper_bound, tnpx, l.relative_rate]]);
                } else if(l.multiplier === VM.LM_PEAK_INC) {
                  // NOTE: "peak increase" may be > 0 only in the first time step
                  // of the block being optimized, and in the first step of the
                  // look-ahead period (if peak rises in that period), and will
                  // be 0 in all other time steps; the VM instruction handles this
                  // NOTE: delay is always 0 for this link flow
                  this.code.push([VMI_update_cash_coefficient, [
                      VM.PRODUCE, VM.PEAK_INC, p.peak_inc_var_index, 0,
                      tnpx, l.relative_rate]]);
                } else if(tnpx.isStatic && l.relative_rate.isStatic) {
                  // If link rate and product price are static, only add the variable
                  // if rate*price is non-zero (and th en use the static VM instruction)
                  k = tnpx.result(0) * l.relative_rate.result(0);
                  if(Math.abs(k) > VM.NEAR_ZERO) {
                    // Production rate & price are static: pass one constant
                    this.code.push([VMI_update_cash_coefficient,
                        [VM.PRODUCE, VM.ONE_C, vi, l.flow_delay, k]]);
                    // When multiplier is Delta, subtract level in previous t
                    // (so add 1 to flow delay, and consume, rather than produce)
                    if(l.multiplier === VM.LM_INCREASE) {
                      this.code.push([VMI_update_cash_coefficient,
                          // NOTE: 6th argument = 1 indicates "delay + 1"
                          [VM.CONSUME, VM.ONE_C, vi, l.flow_delay, k, 1]]);
                    }
                  }
                } else {
                  // Production rate or price are dynamic: pass two expressions
                  this.code.push([VMI_update_cash_coefficient, [
                      VM.PRODUCE, VM.TWO_X, vi, l.flow_delay,
                      tnpx, l.relative_rate]]);
                  // When multiplier is Delta, consume level in previous t
                  if(l.multiplier === VM.LM_INCREASE) {
                    this.code.push([VMI_update_cash_coefficient, [
                        VM.CONSUME, VM.TWO_X, vi, l.flow_delay,
                        // NOTE: now 7th argument indicates "delay + 1"
                        tnpx, l.relative_rate, 1]]);
                  }
                }
              }
            }
          } // END of FOR ALL output links
        } // END of IF process not ignored
      } // END of FOR ALL processes
      
      // NOTE: if the last VM instruction still is "clear coefficients",
      //       this means that (so far) no actor cash flows were detected
      if(this.no_cash_flows) {
        this.no_cash_flows =
            this.code[this.code.length-1][0] === VMI_clear_coefficients;
      }
      
      // ALWAYS add the two cash flow constraints for this actor, as both cash
      // flow variables must be computed (will be 0 if no cash flows)
      this.code.push(
          [VMI_copy_cash_coefficients, VM.PRODUCE],
          [VMI_add_const_to_coefficient, [a.cash_in_var_index, 1]],
          [VMI_add_constraint, VM.EQ],
          [VMI_copy_cash_coefficients, VM.CONSUME],
          [VMI_add_const_to_coefficient, [a.cash_out_var_index, 1]],
          [VMI_add_constraint, VM.EQ]
      );
      
    } // END of FOR loop iterating over all actors
    
    // NEXT: define the coefficients for the objective function
    this.code.push([VMI_clear_coefficients, null]);

    // NOTE: if, after all actors -- this includes (no actor) -- have been
    // considered, no cash flows have been detected, the solver should aim for
    // minimal effort, i.e., lowest weighted sum of process levels
    if(this.no_cash_flows) {
      for(i = 0; i < process_keys.length; i++) {
        k = process_keys[i];
        if(!MODEL.ignored_entities[k]) {
          p = MODEL.processes[k];
          const a = p.actor;
          if(a.weight.defined) {
            if(a.weight.isStatic) {
              this.code.push([VMI_subtract_const_from_coefficient,
                  [p.level_var_index, a.weight.result(0)]]);
            } else {
              this.code.push([VMI_subtract_var_from_coefficient,
                  [p.level_var_index, a.weight]]);
            }
          }
        }
      }
    } else {
      // If cash flows HAVE been detected, use actor weights as coefficients:
      // positive for their cash IN, and negative for their cash OUT
      for(let ai = 0; ai < actor_keys.length; ai++) {
        const a = MODEL.actors[actor_keys[ai]];
        // Ignore actors with undefined weights (should not occur since
        // default weight = 1)
        if(a.weight.defined) {
          if(a.weight.isStatic) {
            const c = a.weight.result(0);
            this.code.push(
                [VMI_add_const_to_coefficient, [a.cash_in_var_index, c]],
                [VMI_subtract_const_from_coefficient, [a.cash_out_var_index, c]]
            );
          } else {
            this.code.push(
                [VMI_add_var_to_coefficient, [a.cash_in_var_index, a.weight]],
                [VMI_subtract_var_from_coefficient,
                    [a.cash_out_var_index, a.weight]]
            );
          }
        }
      }
    }

    // Finally, check whether any coefficients for the objective function have
    // been added (by looking at the last VM instruction added to the code)
    if(this.code[this.code.length - 1][0] === VMI_clear_coefficients) {
      // If not, set the coefficients for ALL processes to -1
      for(i = 0; i < process_keys.length; i++) {
        k = process_keys[i];
        if(!MODEL.ignored_entities[k]) {
          this.code.push([VMI_add_const_to_coefficient,
              [MODEL.processes[k].level_var_index, -1]]);
        }
      }
    }

    // Copy the VM coefficient vector to the objective function coefficients
    // NOTE: for the VM's current time step (VM.t)!
    this.code.push([VMI_set_objective, null]);

    // NOTES:
    // (1) Scaling of the objective function coefficients is performed by the
    //     VM just before the tableau is submitted to the solver, so for now it
    //     suffices to differentiate between the different "priorities" of slack
    //     variables
    // (2) Slack variables have different penalties: type 0 = market demands,
    //     i.e., EQ constraints on stocks, 1 = GE and LE constraints on product
    //     levels, 2 = strongest constraints: on data, or set by boundlines
    let pen, hb;
    for(i = 0; i < product_keys.length; i++) {
      k = product_keys[i];
      if(!MODEL.ignored_entities[k]) {
        p = MODEL.products[k];
        if(p.level_var_index >= 0 && !p.no_slack) {
          hb = p.hasBounds;
          pen = (p.is_data ? 2 :
              // NOTE: lowest penalty also for IMPLIED sources and sinks
              (p.equal_bounds || (!hb && (p.isSourceNode || p.isSinkNode)) ? 0 :
                  (hb ? 1 : 2)));
          this.slack_variables[pen].push(
              p.stock_LE_slack_var_index, p.stock_GE_slack_var_index);
        }
      }
    }
    
    // NEXT: add product constraints to calculate (and constrain) their stock

    for(let pi = 0; pi < product_keys.length; pi++) {
      k = product_keys[pi];
      if(!MODEL.ignored_entities[k]) {
        p = MODEL.products[k];
        // NOTE: Actor cash flow data products are a special case.
        if(p.name.startsWith('$')) {
          // Get the associated actor entity.
          const parts = p.name.substring(1).split(' ');
          parts.shift();
          const
              aid = UI.nameToID(parts.join(' ')),
              a = MODEL.actorByID(aid);
          if(a) {
            this.code.push([VMI_clear_coefficients, null]);
            // Use actor's cash variable indices w/o weight.
            if(p.name.startsWith('$IN ')) {
              // Add coefficient +1 for cash IN index.
              this.code.push([VMI_add_const_to_coefficient,
                  [a.cash_in_var_index, 1, 0]]);
            } else if(p.name.startsWith('$OUT ')) {
              // Add coefficient +1 for cash OUT index.
              this.code.push([VMI_add_const_to_coefficient,
                  [a.cash_out_var_index, 1, 0]]);
            } else if(p.name.startsWith('$FLOW ')) {
              // Add coefficient +1 for cash IN index.
              this.code.push([VMI_add_const_to_coefficient,
                  [a.cash_in_var_index, 1, 0]]);
              // Add coefficient -1 for cash OUT index.
              this.code.push([VMI_add_const_to_coefficient,
                  [a.cash_out_var_index, -1, 0]]);
            }
            // Add coefficient -1 for level index variable of `p`.
            this.code.push([VMI_add_const_to_coefficient,
                [p.level_var_index, -1, 0]]);
            this.code.push([VMI_add_constraint, VM.EQ]);
          } else {
            console.log('ANOMALY: no actor for cash flow product', p.displayName);
          }
        // NOTE: constants are not affected by their outgoing data (!) links
        } else if(!p.isConstant) {
  
          // FIRST: add a constraint that "computes" the product stock level
          // set coefficients vector to 0 (NOTE: this also sets RHS to 0)
          this.code.push([VMI_clear_coefficients, null]);
    
          // Add inflow into product P from input nodes
          for(i = 0; i < p.inputs.length; i++) {
            l = p.inputs[i];
            if(!MODEL.ignored_entities[l.identifier]) {
              const fn = l.from_node;
              // If data flow, use the appropriate variable
              if(l.multiplier === VM.LM_POSITIVE) {
                vi = fn.on_off_var_index;
              } else if (l.multiplier === VM.LM_ZERO) {
                vi = fn.is_zero_var_index;
              } else if(l.multiplier === VM.LM_STARTUP) {
                vi = fn.start_up_var_index;
              } else if(l.multiplier === VM.LM_FIRST_COMMIT) {
                vi = fn.first_commit_var_index;
              } else if(l.multiplier === VM.LM_SHUTDOWN) {
                vi = fn.shut_down_var_index;
              } else if(l.multiplier === VM.LM_PEAK_INC) {
                vi = fn.peak_inc_var_index;
              } else {
                vi = fn.level_var_index;
              }
              // First check for throughput links, as these are elaborate
              if(l.multiplier === VM.LM_THROUGHPUT) {
                // Link `l` is Y-->Z and "reads" the total inflow into Y
                // over links Xi-->Y having rate Ri and when Y is a
                // product potentially also delay Di.
                let ll, lfn, lvi;
                if(fn instanceof Process) {
                  // When throughput is read from process Y, the flow
                  // over link `l` equals the (sum of all Ri) times the
                  // level of Y times the rate of `l`
                  for(j = 0; j < fn.inputs.length; j++) {
                    ll = fn.inputs[j];
                    this.code.push([VMI_add_throughput_to_coefficient,
                        [vi, l.relative_rate, l.flow_delay,
                            // Input links of processes have no delay
                            ll.relative_rate, 0]]);
                  }
                } else {
                  // When read from product Y, throughput to be added to
                  // Z equals sum of inflows of FROM node Y:
                  //   Xi --(r2,d2)--> Y --(r1,d1)--> Z
                  // so instead of the level of Y (having index vi), use
                  // the level of Xi (for each input i of Y)
                  for(j = 0; j < fn.inputs.length; j++) {
                    ll = fn.inputs[j];
                    lfn = ll.from_node;
                    // here, too, use the *correct* variable index for Xi!
                    if(ll.multiplier === VM.LM_POSITIVE || ll.multiplier === VM.LM_ZERO) {
                      lvi = lfn.on_off_var_index;
                    } else if(ll.multiplier === VM.LM_STARTUP) {
                      lvi = lfn.start_up_var_index;
                    } else if(ll.multiplier === VM.LM_FIRST_COMMIT) {
                      lvi = lfn.first_commit_var_index;
                    } else if(ll.multiplier === VM.LM_SHUTDOWN) {
                      lvi = lfn.shut_down_var_index;
                    } else {
                      lvi = lfn.level_var_index;
                    }
                    // NOTE: we trade-off efficiency gain during execution
                    // against simplicity now by not checking whether rates
                    // are static; the VM instruction will be a bit slower
                    // as it calls the result(t) method for both rates
                    this.code.push([VMI_add_throughput_to_coefficient,
                        [lvi, l.relative_rate, l.flow_delay,
                            ll.relative_rate, ll.flow_delay]]);
                  }
                }
              } else if(l.multiplier === VM.LM_PEAK_INC) {
                // SPECIAL instruction that adds flow only for first t of block
                // NOTE: no delay on this type of link
                this.code.push([VMI_add_peak_increase_at_t_0,
                    [vi, l.relative_rate]]);
              } else if(l.relative_rate.isStatic) {
                // Static rates permit simpler VM instructions
                c = l.relative_rate.result(0);
                if(l.multiplier === VM.LM_SUM) {
                  this.code.push([VMI_add_const_to_sum_coefficients,
                      [vi, c, l.flow_delay]]);
                } else if(l.multiplier === VM.LM_MEAN) {
                  this.code.push([VMI_add_const_to_sum_coefficients,
                      // NOTE: 4th parameter = 1 indicates "divide c by delay + 1"
                      [vi, c, l.flow_delay, 1]]);
                } else if(l.multiplier === VM.LM_SPINNING_RESERVE) {
                  // "spinning reserve" equals UB - level if level > 0, or 0
                  // so add ON/OFF * UB * rate ...
                  const fnub = l.from_node.upper_bound;
                  if(fnub.isStatic) {
                    this.code.push([VMI_add_const_to_coefficient,
                        [fn.on_off_var_index, fnub.result(0) * c, l.flow_delay]]);
                  } else {
                    // NOTE: constant `c` is passed as 5th parameter
                    // (var multiplier) since 4th parameter = 1 indicates "delay + 1"
                    this.code.push([VMI_add_var_to_coefficient,
                        [fn.on_off_var_index, fnub, l.flow_delay, 0, c]]);
                  }
                  // ... and subtract level * rate
                  this.code.push([VMI_subtract_const_from_coefficient,
                      [vi, c, l.flow_delay]]);
                } else {
                  this.code.push([VMI_add_const_to_coefficient,
                      [vi, c, l.flow_delay]]);
                  if(l.multiplier === VM.LM_INCREASE) {
                    this.code.push([VMI_subtract_const_from_coefficient,
                        // NOTE: 4th argument indicates "delay + 1"
                        [vi, c, l.flow_delay, 1]]);
                  }
                }
              } else {
                // NOTE: `c` is now an expression
                c = l.relative_rate;
                if(l.multiplier === VM.LM_SUM) {
                  this.code.push([VMI_add_var_to_weighted_sum_coefficients,
                      [vi, c, l.flow_delay]]);
                } else if(l.multiplier === VM.LM_MEAN) {
                  this.code.push([VMI_add_var_to_weighted_sum_coefficients,
                      [vi, c, l.flow_delay, 1]]);
                } else if(l.multiplier === VM.LM_SPINNING_RESERVE) {
                  // "spinning reserve" equals UB - level if level > 0, or 0
                  // so add ON/OFF * UB * rate ...
                  this.code.push([VMI_add_var_product_to_coefficient,
                      [fn.on_off_var_index, l.from_node.upper_bound,
                          c, l.flow_delay]]);
                  // ... and subtract level * rate
                  this.code.push([VMI_subtract_var_from_coefficient,
                      [vi, c, l.flow_delay]]);
                } else {
                  this.code.push([VMI_add_var_to_coefficient,
                      [vi, c, l.flow_delay]]);
                  if(l.multiplier === VM.LM_INCREASE) {
                    this.code.push([VMI_subtract_var_from_coefficient,
                        // NOTE: 4th argument indicates "delay + 1"
                        [vi, c, l.flow_delay, 1]]);
                  }
                }
              }
            } // END IF not ignored
          } // END FOR all inputs
          
          // subtract outflow from product P to consuming processes (outputs)
          for(i = 0; i < p.outputs.length; i++) {
            // NOTE: only consider outputs to processes; data outflows do not subtract
            l = p.outputs[i];
            if(!MODEL.ignored_entities[l.identifier]) {
              if(l.to_node instanceof Process) {
                const rr = l.relative_rate;
                if(rr.isStatic) {
                  this.code.push([VMI_subtract_const_from_coefficient,
                      [l.to_node.level_var_index, rr.result(0), l.flow_delay]]);
                } else {
                  this.code.push([VMI_subtract_var_from_coefficient,
                      [l.to_node.level_var_index, rr, l.flow_delay]]);
                }
              }
            }
          }
          
          // NOTES:
          // (1) for products with storage, set the coefficient for this product's
          // stock IN THE PREVIOUS TIME STEP to 1
          // (2) the VM instruction will subtract the stock level at the end of the
          // previous block from the RHS if t=block_start, or the initial level if t=1
          if(p.is_buffer) {
            this.code.push([VMI_add_const_to_coefficient,
                [p.level_var_index, 1, 1]]); // delay of 1
          }
          
          // Set the coefficient for this product's stock NOW to -1 so that
          // the EQ constraint (having RHS = 0) will effectuate that the
          // stock variable takes on the correct value
          // NOTE: do this only when `p` is NOT data, or `p` has links
          // IN or OUT (meaning: 1 or more coefficients)
          if(!p.is_data || p.inputs.length + p.outputs.length > 0) {
            this.code.push([VMI_add_const_to_coefficient,
                [p.level_var_index, -1]]);
            this.code.push([VMI_add_constraint, VM.EQ]);
          }
        }
  
        // Set the bound constraints on the product stock variable
        this.setBoundConstraints(p);
      }
    }

    // NEXT: add constraints that will set values of binary variables
    // NOTE: This is not trivial!
    /*
       Each node with +/0 output arrow also has a BINARY on/off variable OO.
       Each node with 0 output arrow then also has an "is zero" variable IZ.
       Each node with "start-up" output arrow also has a BINARY variable SU.      
       For each timestep t:
        - OO[t] = 1 if process level or stock level > 0, and 0 otherwise
        - IZ[t] = 1 - OO[t]
        - SU[t] = 1 iff OO[t] - OO[t-1] > 0
  
       Assuming L[t] to be the stock or level of a node, two constraints
       are added for each t to give the (binary!) on/off variable OO
       this behavior:
       (a)  L[t] - LB[t]*OO[t] >= 0
       (b)  L[t] - UB[t]*OO[t] <= 0
       where UB and LB are the bounds of the node.
  
       NOTES:
       (1) When LB = 0, then (a) does not force OO to become 0 if L = 0!
           Hence, start-up is calculated correctly only for processes having
           LB > 0. Therefore, when LB = 0, a small positive number is used as LB
           in constraint (a). This is achieved by a special VM instruction.
       (2) On/Off-related constraints are skipped when UB < 0 or UB is infinite.
           This is achieved by a special VM instruction.
       (3) When UB is infinite, the modeler is notified while code is generated.
            
  
       To compute the is-zero binary, add this constraint:
       (c) OO[t] + IZ[t] = 1
       Then this constraint on IZ makes that OO is computed correctly even when
       LB = 0:
       (d) L[t] + IZ[t] >= LB[t]
       NOTE: for semicontinuous variables, use 0 instead of LB[t]

       To compute the start-up binary SU, we add these constraints:
       (e)  OO[t-1] - OO[t] + SU[t] >= 0
            (so SU[t] > 0 if process ON at t, but not at t-1)
       (f)  OO[t] - SU[t] >= 0
            (to prevent that SU[t] = 1 when OO[t] = 0)
       (g)  OO[t-1] + OO[t] + SU[t] <= 2
            (to prevent that SU[t] = 1 when OO[t-1] = 1 and OO[t] = 1, i.e.,
             the process was already ON)
  
       If (f) and (g) are omitted, a penalty must be associated with SU[t]
       (for t = 1...n) in the objective function to ensure that SU[t] will not
       become 1 when 0 suffices to meet (e).

       To compute the shut-down binary SD, we add these constraints:
       (e2) OO[t] - OO[t-1] + SD[t] >= 0  (permits 00*, 01*, 11*, but only 101,
            so SD[t] > 0 if process OFF at t, but not at t-1)
       (f2) OO[t] + SD[t] <= 1
            (rules out *11 to prevent that SD[t] = 1 when OO[t] = 1)
       (g2) SD[t] - OO[t-1] - OO[t] <= 0
            (rules out 001 to prevent SD[t] = 1 when the process was already OFF)
            
       To detect a first commit, we accumulate the binary start-ups in an
       extra variable SC:
       (h)  SC[t] - SC[t-1] - SU[t] = 0
       Then ensure that binary variable SO[t] = 1 iff SC[t] > 0:
       (there will never be more than run length start-ups)
       (i)  SC[t] - SO[t] >= 0
       (j)  SC[t] - run length * SO[t] <= 0
       To strictly determine FC, we add these constraints:
       (k)  SO[t-1] - SO[t] + FC[t] >= 0
            (so FC[t] must be 1 if SC > 0 at t, but not at t-1)
       (l)  SO[t] - FC[t] >= 0
            (to prevent that FC[t] = 1 when SO[t] = 0)
       (m)  SO[t-1] + SO[t] + FC[t] <= 2
            (to prevent that FC[t] = 1 when SO[t-1] = 1 and SO[t] = 1, i.e.,
             SC was already > 0)

       To calculate the peak increase values, we need two continuous
       "chunk variables", i.e., only 1 tableau column per chunk, not 1 for
       each time step. These variables BPI and CPI will compute the highest
       value (for all t in the block (B) and for the chunk (C)) of the
       difference L[t] - block peak (BP) of previous block. This requires
       one equation for every t = 1, ..., block length:
       (n) L[t] - BPI[b] <= BP[b-1]  (where b denotes the block number)
       plus one equation for every t = block length + 1 to chunk length:
       (o) L[t] - BPI[b] - CPI[b] <= BP[b-1]
       This ensures that CPI is the *additional* increase in the look-ahead 
       Then use BPI[b] in first time step if block, and CPI[b] at first
       time step of the look-ahead period to compute the actual flow for
       the "peak increase" links. For all other time steps this AF equals 0.

       NOTE: These constraints alone set the lower bound for BPI and CPI, so
       these variables can take on higher values. The modeler must ensure
       that there is a cost associated with the actual flow, not a revenue.
    */
    // NOTE: as of 20 June 2021, binary attributes of products are also computed
    const pp_nodes = [];
    for(i = 0; i < process_keys.length; i++) {
      k = process_keys[i];
      if(!MODEL.ignored_entities[k]) pp_nodes.push(MODEL.processes[k]);
    }
    for(i = 0; i < product_keys.length; i++) {
      k = product_keys[i];
      if(!MODEL.ignored_entities[k]) pp_nodes.push(MODEL.products[k]);
    }

    for(let i = 0; i < pp_nodes.length; i++) {
      p = pp_nodes[i];
      if(p.on_off_var_index >= 0) {
        // NOTE: when UB is dynamic, its value may become <= 0, and in such
        // cases, the default constraints for computing OO, IZ and SU will fail.
        // To deal with this, the default equations will NOT be set when UB <= 0,
        // while the "exceptional" equations (q.v.) will NOT be set when UB > 0.
        // This can be realized using a special VM instruction:
        ubx = (p.equal_bounds && p.lower_bound.defined ? p.lower_bound : p.upper_bound);
        this.code.push([VMI_set_add_constraints_flag, [ubx, '>', 0]]);

        // NOTE: if UB <= 0 the following constraints will be prepared but NOT added   

        this.code.push(
          // Set coefficients vector to 0
          [VMI_clear_coefficients, null],
          // (a) L[t] - LB[t]*OO[t] >= 0
          [VMI_add_const_to_coefficient, [p.level_var_index, 1]]
        );
        if(p.lower_bound.isStatic) {
          let lb = p.lower_bound.result(0);
          if(Math.abs(lb) < VM.NEAR_ZERO) lb = VM.ON_OFF_THRESHOLD;
          this.code.push([VMI_subtract_const_from_coefficient,
            [p.on_off_var_index, lb]]);
        } else {
          this.code.push([VMI_subtract_var_from_coefficient,
            // NOTE: the 3rd parameter signals VM to use the ON/OFF threshold
            // value when the LB evaluates as near-zero
            [p.on_off_var_index, p.lower_bound, VM.ON_OFF_THRESHOLD]]);
        }
        this.code.push(
          [VMI_add_constraint, VM.GE], // >= 0 as default RHS = 0
          // Set coefficients vector to 0
          [VMI_clear_coefficients, null],
          // (b) L[t] - UB[t]*OO[t] <= 0
          [VMI_add_const_to_coefficient, [p.level_var_index, 1]]
        );
        if(ubx.isStatic) {
          // If UB is very high (typically: undefined, so +INF), try to infer
          // a lower value for UB to use for the ON/OFF binary
          let ub = ubx.result(0),
              hub = ub;
          if(ub > VM.MEGA_UPPER_BOUND) {
            hub = p.highestUpperBound([]);
            // If UB still very high, warn modeler on infoline and in monitor
            if(hub > VM.MEGA_UPPER_BOUND) {
              const msg = 'High upper bound (' + this.sig4Dig(hub) +
                  ') for <strong>' + p.displayName + '</strong>' +
                  ' will compromise computation of its binary variables';
              UI.warn(msg);
              this.logMessage(this.block_count,
                  'WARNING: ' + msg.replace(/<\/?strong>/g, '"'));
            }
          }
          if(hub !== ub) {
            ub = hub;
            this.logMessage(this.block_count,
                `Inferred upper bound for ${p.displayName}: ${this.sig4Dig(ub)}`);
          }
          this.code.push([VMI_subtract_const_from_coefficient,
            [p.on_off_var_index, ub]]);
        } else {
          // NOTE: no check (yet) for high values when UB is an expression
          // (this could be achieved by a special VM instruction)
          this.code.push([VMI_subtract_var_from_coefficient,
            [p.on_off_var_index, ubx]]);
        }
        this.code.push(
          [VMI_add_constraint, VM.LE], // <= 0 as default RHS = 0 
          // Also add the constraints for is-zero
          [VMI_clear_coefficients, null],
          // (c) OO[t] + IZ[t] = 1
          [VMI_add_const_to_coefficient, [p.is_zero_var_index, 1]],
          [VMI_add_const_to_coefficient, [p.on_off_var_index, 1]],
          [VMI_set_const_rhs, 1],
          [VMI_add_constraint, VM.EQ],
          // (d) L[t] + IZ[t] >= LB[t]
          [VMI_clear_coefficients, null],
          [VMI_add_const_to_coefficient, [p.level_var_index, 1]],
          [VMI_add_const_to_coefficient, [p.is_zero_var_index, 1]]
        );
        // NOTE: for semicontinuous variable, always use LB = 0
        if(p.lower_bound.isStatic || p.level_to_zero) {
          const plb = (p.level_to_zero ? 0 : p.lower_bound.result(0));
          this.code.push([VMI_set_const_rhs, plb]);
        } else {
          this.code.push([VMI_set_var_rhs, p.lower_bound]);
        }
        this.code.push([VMI_add_constraint, VM.GE]);

        // Also add constraints for start-up (if needed)
        if(p.start_up_var_index >= 0) {
          this.code.push(
            // (e) OO[t-1] - OO[t] + SU[t] >= 0 
            [VMI_clear_coefficients, null],
            [VMI_add_const_to_coefficient,
                [p.on_off_var_index, 1, 1]], // delay of 1!
            [VMI_add_const_to_coefficient, [p.on_off_var_index, -1]],
            [VMI_add_const_to_coefficient, [p.start_up_var_index, 1]],
            // Constraint is >= 0 since default RHS = 0
            [VMI_add_constraint, VM.GE],
            // (f) OO[t] - SU[t] >= 0
            [VMI_clear_coefficients, null],
            [VMI_add_const_to_coefficient, [p.on_off_var_index, 1]],
            [VMI_add_const_to_coefficient, [p.start_up_var_index, -1]],
            [VMI_add_constraint, VM.GE], 
            // (g) OO[t-1] + OO[t] + SU[t] <= 2
            [VMI_clear_coefficients, null],
            [VMI_add_const_to_coefficient,
                [p.on_off_var_index, 1, 1]], // delay of 1!
            [VMI_add_const_to_coefficient, [p.on_off_var_index, 1]],
            [VMI_add_const_to_coefficient, [p.start_up_var_index, 1]],
            [VMI_add_const_to_rhs, 2],
            [VMI_add_constraint, VM.LE]
          );
          if(p.first_commit_var_index >= 0) {
            this.code.push(
              // (h)  SC[t] - SC[t-1] - SU[t] = 0
              [VMI_clear_coefficients, null],
              [VMI_add_const_to_coefficient, [p.start_up_count_var_index, 1]],
              [VMI_add_const_to_coefficient,
                  [p.start_up_count_var_index, -1, 1]], // delay of 1!
              [VMI_add_const_to_coefficient, [p.start_up_var_index, -1]],
              [VMI_add_constraint, VM.EQ], 
              // (i)  SC[t] - SO[t] >= 0
              [VMI_clear_coefficients, null],
              [VMI_add_const_to_coefficient, [p.start_up_count_var_index, 1]],
              [VMI_add_const_to_coefficient, [p.suc_on_var_index, -1]],
              [VMI_add_constraint, VM.GE], 
              // (j)  SC[t] - run length * SO[t] <= 0
              [VMI_clear_coefficients, null],
              [VMI_add_const_to_coefficient, [p.start_up_count_var_index, 1]],
              [VMI_add_const_to_coefficient,
                  [p.suc_on_var_index, -MODEL.runLength]],
              [VMI_add_constraint, VM.LE],
              // (k)  SO[t-1] - SO[t] + FC[t] >= 0
              [VMI_clear_coefficients, null],
              [VMI_add_const_to_coefficient,
                  [p.suc_on_var_index, 1, 1]], // delay of 1!
              [VMI_add_const_to_coefficient, [p.suc_on_var_index, -1]],
              [VMI_add_const_to_coefficient, [p.first_commit_var_index, 1]],
              [VMI_add_constraint, VM.GE], 
              // (l)  SO[t] - FC[t] >= 0
              [VMI_clear_coefficients, null],
              [VMI_add_const_to_coefficient, [p.suc_on_var_index, 1]],
              [VMI_add_const_to_coefficient, [p.first_commit_var_index, -1]],
              [VMI_add_constraint, VM.GE], 
              // (m)  SO[t-1] + SO[t] + FC[t] <= 2
              [VMI_clear_coefficients, null],
              [VMI_add_const_to_coefficient,
                  [p.suc_on_var_index, 1, 1]], // delay of 1!
              [VMI_add_const_to_coefficient, [p.suc_on_var_index, 1]],
              [VMI_add_const_to_coefficient, [p.first_commit_var_index, 1]],
              [VMI_add_const_to_rhs, 2],
              [VMI_add_constraint, VM.LE] 
            );
          }
        }

        // Likewise add constraints for shut-down (if needed)
        if(p.shut_down_var_index >= 0) {
          this.code.push(
            // (e2) OO[t] - OO[t-1] + SD[t] >= 0
            [VMI_clear_coefficients, null],
            [VMI_add_const_to_coefficient, [p.on_off_var_index, 1]],
            [VMI_add_const_to_coefficient,
                [p.on_off_var_index, -1, 1]], // delay of 1!
            [VMI_add_const_to_coefficient, [p.shut_down_var_index, 1]],
            // Constraint is >= 0 since default RHS = 0
            [VMI_add_constraint, VM.GE],
            // (f2) OO[t] + SD[t] <= 1
            [VMI_clear_coefficients, null],
            [VMI_add_const_to_coefficient, [p.on_off_var_index, 1]],
            [VMI_add_const_to_coefficient, [p.shut_down_var_index, 1]],
            [VMI_add_const_to_rhs, 1],
            [VMI_add_constraint, VM.LE], 
            // (g2) SD[t] - OO[t-1] - OO[t] <= 0
            [VMI_clear_coefficients, null],
            [VMI_add_const_to_coefficient, [p.shut_down_var_index, 1]],
            [VMI_add_const_to_coefficient,
                [p.on_off_var_index, -1, 1]], // delay of 1!
            [VMI_add_const_to_coefficient, [p.on_off_var_index, -1]],
            [VMI_add_constraint, VM.LE]
          );
        }

        // NOTE: toggle the flag so that if UB <= 0, the following constraints
        // for setting the binary variables WILL be added   
        this.code.push(
          [VMI_toggle_add_constraints_flag, null],
          // When UB <= 0, add these much simpler "exceptional" constraints:
          // OO[t] = 0
          [VMI_clear_coefficients, null],
          [VMI_add_const_to_coefficient, [p.on_off_var_index, 1]],
          [VMI_add_constraint, VM.EQ],          
          // IZ[t] = 1
          [VMI_clear_coefficients, null],
          [VMI_add_const_to_coefficient, [p.is_zero_var_index, 1]],
          [VMI_set_const_rhs, 1], // RHS = 1
          [VMI_add_constraint, VM.EQ]
        );          
        // Add constraints for start-up and first commit only if needed
        if(p.start_up_var_index >= 0) {
          this.code.push(
            // SU[t] = 0 
            [VMI_clear_coefficients, null],
            [VMI_add_const_to_coefficient, [p.start_up_var_index, 1]],
            [VMI_add_constraint, VM.EQ]
          );          
          if(p.first_commit_var_index >= 0) {
            this.code.push(
              // FC[t] = 0 
              [VMI_clear_coefficients, null],
              [VMI_add_const_to_coefficient, [p.first_commit_var_index, 1]],
              [VMI_add_constraint, VM.EQ]
            );          
          }
        }
        // Add constraint for shut-down only if needed
        if(p.shut_down_var_index >= 0) {
          this.code.push(
            // SD[t] - OO[t-1] = 0
            [VMI_clear_coefficients, null],
            [VMI_add_const_to_coefficient, [p.shut_down_var_index, 1]],
            [VMI_add_const_to_coefficient,
                [p.on_off_var_index, -1, 1]], // delay = 1
            [VMI_add_constraint, VM.EQ]
          );          
        }

        // NOTE: the "add constraints flag" must be reset to TRUE
        this.code.push([VMI_set_add_constraints_flag, true]);
      }
      // Check whether constraints (n) through (p) need to be added
      // to compute the peak level for a block of time steps
      // NOTE: this is independent of the binary variables!
      if(p.peak_inc_var_index >= 0) {
        this.code.push(
          // One special instruction implements this operation, as part
          // of it must be performed only at block time = 0
          [VMI_add_peak_increase_constraints,
              [p.level_var_index, p.peak_inc_var_index]]
        );          
      }
    }
  
    // NEXT: add constraints
    // NOTE: as of version 1.0.10, constraints are implemented using special
    // ordered sets (SOS2). This is effectuated with a dedicated VM instruction
    // for each of its "active" bound lines. This instruction requires these
    // parameters:
    // - variable indices for the constraining node X, the constrained node Y
    // - expressions for the LB and UB of X and Y
    // - the bound line object, as this provides all further information
    for(i = 0; i < constraint_keys.length; i++) {
      k = constraint_keys[i];
      if(!MODEL.ignored_entities[k]) {
        c = MODEL.constraints[k];
        // Get the two associated nodes
        const
           x = c.from_node,
           y = c.to_node;
        for(j = 0; j < c.bound_lines.length; j++) {
          const bl = c.bound_lines[j];
          // Only add constrains for bound lines that are "active" for the
          // current run, and do constrain Y in some way
          if(bl.isActive && bl.constrainsY) {
            this.code.push([VMI_add_bound_line_constraint,
                [x.level_var_index, x.lower_bound, x.upper_bound,
                    y.level_var_index, y.lower_bound, y.upper_bound, bl]]);
          }
        }
      }
    } // end FOR all constraints
    MODEL.set_up = true;
    this.logMessage(this.block_count,
      `Problem formulation took ${this.elapsedTime} seconds.`);
  } // END of setup_problem function

  scaleObjective() {
    // scales coefficients to range between -2 and +2
    // NOTE: also computes and sets the minimum slack penalty value
    // the VM should use
    this.low_coefficient = VM.PLUS_INFINITY;
    this.high_coefficient = VM.MINUS_INFINITY;
    for(let i in this.objective) if(Number(i)) {
      const c = this.objective[i];
      this.low_coefficient = Math.min(this.low_coefficient, c);
      this.high_coefficient = Math.max(this.high_coefficient, c);
    }
    // Slack penalty must exceed the maximum joint utility of all processes
    // Use 1 even if highest link rate < 1
    let high_rate = 1;  
    for(let i in MODEL.links) if(MODEL.links.hasOwnProperty(i) &&
        !MODEL.ignored_entities[i]) {
      for(let j = this.block_start; j < this.block_start + this.chunk_length; j++) {
        const r = MODEL.links[i].relative_rate.result(j);
        // NOTE: ignore errors and "undefined" (chunk Length may exceed actual block length)
        if(r <= VM.PLUS_INFINITY) {
          high_rate = Math.max(high_rate, Math.abs(r));
        }
      }
    }
    // Similar to links, composite constraints X-->Y can act as multipliers:
    // since CC map the range (UB - LB) of node X to range (UB - LB) of node Y,
    // the multiplier is rangeY / rangeX:
    for(let i in MODEL.constraints) if(MODEL.constraints.hasOwnProperty(i) &&
        !MODEL.ignored_entities[i]) {
      const c = MODEL.constraints[i];
      for(let j = this.block_start; j < this.block_start + this.chunk_length; j++) {
        const
            fnlb = c.from_node.lower_bound.result(j),
            fnub = c.from_node.upper_bound.result(j),
            tnlb = c.to_node.lower_bound.result(j),
            tnub = c.to_node.upper_bound.result(j),
            fnrange = (fnub > fnlb + VM.NEAR_ZERO ? fnub - fnlb : fnub),
            tnrange = (tnub > tnlb + VM.NEAR_ZERO ? tnub - tnlb : tnub),
            // Divisor near 0 => multiplier
            m = (fnrange > VM.NEAR_ZERO ? tnrange / fnrange : tnrange);
        high_rate = Math.max(high_rate, m);
      }
    }
    
    // Base penalty is BASE * highest coefficient, multiplied by the square
    // root of the number of processes times the highest link multiplier
    this.slack_penalty = VM.BASE_PENALTY * this.chunk_length *
        Math.max(1, Math.ceil(Math.sqrt(Object.keys(MODEL.processes).length) *
            high_rate) + 1);
    if(this.slack_penalty > VM.MAX_SLACK_PENALTY) {
      this.slack_penalty = VM.MAX_SLACK_PENALTY;
      this.logMessage(this.block_count,
        'WARNING: Max. slack penalty reached; try to scale down your model coefficients');
    }
    const m = Math.max(
        Math.abs(this.low_coefficient), Math.abs(this.high_coefficient));
    // Scaling is useful if m is larger than 2
    if(m > 2 && m < VM.PLUS_INFINITY) {
      // Use reciprocal because multiplication is faster than division
      const scalar = 2 / m;
      this.scaling_factor = 0.5 * m;
      for(let i in this.objective) {
        if(Number(i)) this.objective[i] *= scalar;
      }
      this.low_coefficient *= scalar;
      this.high_coefficient *= scalar;
    } else {
      this.scaling_factor = 1;
    }
  }

  scaleCashFlowConstraints() {
    // Scale cash flow coefficients per actor by dividing them by the largest
    // cash flow coefficient (in absolute value) within the current block
    // so that cash flows cannot easily "overrule" the slack penalties in the
    // objective function
    // NOTE: no scaling needed if model features no cash flows
    if(this.no_cash_flows) return;
    this.logMessage(this.block_count,
        'Cash flows scaled by 1/' + this.cash_scalar);
    // Use reciprocal as multiplier to scale the constraint coefficients
    const m = 1 / this.cash_scalar;
    let cv;
    for(let i = 0; i < this.cash_constraints.length; i++) {
      const cc = this.matrix[this.cash_constraints[i]];
      for(let ci in cc) if(cc.hasOwnProperty(ci)) {
        if(ci < this.chunk_offset) {
          // NOTE: subtract 1 as variables array is zero-based
          cv = this.variables[(ci - 1) % this.cols];
        } else {
          // Chunk variable array is zero-based
          cv = this.chunk_variables[ci - this.chunk_offset];
        }
        // NOTE: do not scale the coefficient of the cash variable
        if(!cv[0].startsWith('C')) cc[ci] *= m;
      }
    }
  }

  checkForInfinity(n) {
    // Returns floating point number `n`, or +INF or -INF if the absolute
    // value of `n` is relatively (!) close to the VM infinity constants
    // (since the solver may return imprecise values of such magnitude)
    if(n > 0.5 * VM.PLUS_INFINITY && n < VM.BEYOND_PLUS_INFINITY) {
      return VM.PLUS_INFINITY;
    } 
    if(n < 0.5 * VM.MINUS_INFINITY && n > VM.BEYOND_MINUS_INFINITY) {
      return VM.MINUS_INFINITY;
    }
    return n;
  }

  setLevels(block, round, x, err) {
    // Copies the values of decision variables calculated by the solver
    // `x` holds the solver result, `err` is TRUE if the model was not computed
    // First deal with quirk of JSON, which turns [one value] into value
    if(!(x instanceof Array)) x = [x];
    // `bb` is first time step of this block (blocks are numbered 1, 2, ...)
    // `abl` is the actual block length, i.e., # time steps to set levels for
    let bb = (block - 1) * MODEL.block_length + 1,
        abl = this.chunk_length;
    // If no results computed, preserve those already computed as "look-ahead"
    if(err && block > 1 && MODEL.look_ahead > 0) {
      bb += MODEL.look_ahead;
      abl -= MODEL.look_ahead;
    }
    // NOTE: length of solution vector divided by number of columns should
    // be integer, and typically equal to the actual block length, except for
    // the last block when look-ahead > 0 (as Linny-R never "looks" beyond the
    // simulation end time)
    const
        ncv = this.chunk_variables.length,
        ncv_msg = (ncv ? ' minus ' + pluralS(ncv, 'singular variable') : ''),
        xratio = (x.length - ncv) / this.cols,
        xbl = Math.floor(xratio);
    if(xbl < xratio) console.log('ANOMALY: solution vector length', x.length,
        ncv_msg + ' is not a multiple of # columns', this.cols);
    if(xbl < abl) {
      console.log('Cropping actual block length', abl,
          'to solved block length', xbl);
      abl = xbl;
    }
    // Assume no warnings or errors
    this.error_count = 0;
    // Set cash flows for all actors
    // NOTE: all cash IN and cash OUT values should normally be non-negative,
    // but since Linny-R permits negative lower bounds on processes, and also
    // negative link rates, cash flows may become negative. If that occurs,
    // the modeler should be warned.
    for(let o in MODEL.actors) if(MODEL.actors.hasOwnProperty(o)) {
      const a = MODEL.actors[o];
      // NOTE: `b` is the index to be used for the vectors
      let b = bb;
      // Iterate over all time steps in this block
      // NOTE: -1 because indices start at 1, but list is zero-based
      let j = -1; 
      for(let i = 0; i < abl; i++) {
        // NOTE: cash coefficients computed by the solver must be scaled back
        a.cash_in[b] = this.checkForInfinity(
            x[a.cash_in_var_index + j] * this.cash_scalar);
        a.cash_out[b] = this.checkForInfinity(
            x[a.cash_out_var_index + j] * this.cash_scalar);
        a.cash_flow[b] = a.cash_in[b] - a.cash_out[b];
        // Count occurrences of a negative cash flow (threshold -0.5 cent)
        if(a.cash_in[b] < -0.005) {
          this.logMessage(block, `${this.WARNING}(t=${b}${round}) ` +
              a.displayName + ' cash IN = ' + a.cash_in[b].toPrecision(2));
        }
        if(a.cash_out[b] < -0.005) {
          this.logMessage(block, `${this.WARNING}(t=${b}${round}) ` +
              a.displayName + ' cash IN = ' + a.cash_out[b].toPrecision(2));
        }
        // Advance column offset in tableau by the # cols per time step
        j += this.cols;
        // Advance to the next time step in this block
        b++;
      }
    }
    // Set production levels and start-up moments for all processes
    for(let o in MODEL.processes) if(MODEL.processes.hasOwnProperty(o) &&
        !MODEL.ignored_entities[o]) {
      const
          p = MODEL.processes[o],
          has_OO = (p.on_off_var_index >= 0),
          has_SU = (p.start_up_var_index >= 0),
          has_SD = (p.shut_down_var_index >= 0);
      // Clear all start-ups and shut-downs at t >= bb
      if(has_SU) p.resetStartUps(bb);
      if(has_SD) p.resetShutDowns(bb);
      // NOTE: `b` is the index to be used for the vectors
      let b = bb;
      // Iterate over all time steps in this block
      // NOTE: -1 because indices start at 1, but list is zero-based
      let j = -1; 
      for(let i = 0; i < abl; i++) {
        p.level[b] = this.checkForInfinity(x[p.level_var_index + j]);
        // @@TO DO: If ON/OFF is relevant, check whether it is correctly inferred
        if(has_OO) {
          if(has_SU) {
            // NOTE: some solvers (Gurobi!) may return real numbers instead of
            // integers, typically near-zero or near-one, so only consider
            // values near 1 to indicate start-up
            if(x[p.start_up_var_index + j] > 0.999) {
              p.start_ups.push(b);
            }
          }
          if(has_SD) {
            if(x[p.shut_down_var_index + j] > 0.999) {
              p.shut_downs.push(b);
            }
          }
        }
        // Advance column offset in tableau by the # cols per time step
        j += this.cols;
        // Advance to the next time step in this block
        b++;
      }
    }
    // Set stock levels for all products
    for(let o in MODEL.products) if(MODEL.products.hasOwnProperty(o) &&
        !MODEL.ignored_entities[o]) {
      const
          p = MODEL.products[o],
          has_OO = (p.on_off_var_index >= 0),
          has_SU = (p.start_up_var_index >= 0),
          has_SD = (p.shut_down_var_index >= 0);
      // Clear all start-ups and shut-downs at t >= bb
      if(has_SU) p.resetStartUps(bb);
      if(has_SD) p.resetShutDowns(bb);
      let b = bb;
      // Iterate over all time steps in this block
      let j = -1;
      for(let i = 0; i < abl; i++) {
        p.level[b] = this.checkForInfinity(x[p.level_var_index + j]);
        // @@TO DO: If ON/OFF is relevant, check whether it is correctly inferred
        if(has_OO) {
          // Check if start-up variable is set (see NOTE above)
          if(has_SU) {
            if(x[p.start_up_var_index + j] > 0.999) {
              p.start_ups.push(b);
            }
          }
          // Same for shut-down variable
          if(has_SD) {
            if(x[p.shut_down_var_index + j] > 0.999) {
              p.shut_downs.push(b);
            }
          }
        }
        j += this.cols;
        b++;
      }
    }
    // Get values of peak increase variables from solution vector
    // NOTE: computed offset takes into account that chunk variable list
    // is zero-based!
    const offset = this.cols * abl;
    for(let i = 0; i < ncv; i++) {
      const p = this.chunk_variables[i][1];
      p.b_peak_inc[block] = x[offset + i];
      i++;
      p.la_peak_inc[block] = x[offset + i];
      // Compute the peak from the peak increase
      p.b_peak[block] = p.b_peak[block - 1] + p.b_peak_inc[block];
    }
    // Add warning to messages if slack has been used
    // NOTE: only check after the last round has been evaluated
    if(round === this.lastRound) {
      let b = bb;
      // Iterate over all time steps in this block
      let j = -1;
      for(let i = 0; i < abl; i++) {
        // Index `svt` iterates over types of slack variable (0 - 2)
        for(let svt = 0; svt <= 2; svt++) {
          const
              svl = this.slack_variables[svt],
              l = svl.length;
          for(let k = 0; k < l; k++) {
            const
                vi = svl[k],
                slack = parseFloat(x[vi + j]),
                absl = Math.abs(slack);
            if(absl > VM.NEAR_ZERO) {
              const v = this.variables[vi - 1];
              // NOTE: for constraints, add 'UB' or 'LB' to its vector for the
              // time step where slack was used
              if(v[1] instanceof BoundLine) {
                v[1].constraint.slack_info[b] = v[0];
              }
              if(absl > VM.SIG_DIF_FROM_ZERO) {
                this.logMessage(block, `${this.WARNING}(t=${b}${round}) ` +
                    `${v[1].displayName} ${v[0]} slack = ${this.sig4Dig(slack)}`);
                if(v[1] instanceof Product) {
                  const ppc = v[1].productPositionClusters;
                  for(let ci = 0; ci < ppc.length; ci++) {
                    ppc[ci].usesSlack(b, v[1], v[0]);
                  }
                }
              } else if(CONFIGURATION.slight_slack_notices) {
                this.logMessage(block, '-- Notice: (t=' + b + round + ') ' +
                   v[1].displayName + ' ' + v[0] + ' slack = ' +
                   slack.toPrecision(2));
              }
            }
          }
        }
        j += this.cols;
        b++;
      }
    }
  }
  
  calculateDependentVariables(block) {
    // Calculates the values of all model variables that depend on the values
    // of the decision variables output by the solver
    // NOTE: only for the block that was just solved, but the values are stored
    // in the vectors of nodes and links that span the entire optimization period,
    // hence start by calculating the offset `bb` being the first time step of
    // this block (blocks are numbered 1, 2, ...)
    const bb = (block - 1) * MODEL.block_length + 1;

    // FIRST: calculate the actual flows on links
    let b, bt, p, pl, ld;
    for(let l in MODEL.links) if(MODEL.links.hasOwnProperty(l) &&
        !MODEL.ignored_entities[l]) {
      l = MODEL.links[l];
      // NOTE: flow is determined by the process node, or in case
      // of a P -> P data link by the FROM product node
      p = (l.to_node instanceof Process ? l.to_node : l.from_node);
      b = bb;
      // Iterate over all time steps in this chunk
      for(let i = 0; i < this.chunk_length; i++) {
        // NOTE: flows may have a delay!
        ld = l.actualDelay(b);
        bt = b - ld;
        // NOTE: use non-zero level here to ignore non-zero values that
        // are very small relative to the bounds on the process
        // (typically values below the non-zero tolerance of the solver)
        pl = p.nonZeroLevel(bt);
        if(l.multiplier === VM.LM_SPINNING_RESERVE) {
          pl = (pl > VM.NEAR_ZERO ? p.upper_bound.result(bt) - pl : 0);
        } else if(l.multiplier === VM.LM_POSITIVE) {
          pl = (pl > VM.NEAR_ZERO ? 1 : 0);
        } else if(l.multiplier === VM.LM_ZERO) {
          pl = (Math.abs(pl) < VM.NEAR_ZERO ? 1 : 0);
        } else if(l.multiplier === VM.LM_STARTUP) {
          // NOTE: ignore level; only check whether the start-up variable is set
          pl = (p.start_ups.indexOf(bt) < 0 ? 0 : 1);
        } else if(l.multiplier === VM.LM_FIRST_COMMIT) {
          // NOTE: ignore level; only check whether FIRST start-up occurred at bt
          pl = (p.start_ups.indexOf(bt) === 0 ? 1 : 0);
        } else if(l.multiplier === VM.LM_SHUTDOWN) {
          // NOTE: ignore level; only check whether the shut_down variable is set
          pl = (p.shut_downs.indexOf(bt) < 0 ? 0 : 1);
        } else if(l.multiplier === VM.LM_INCREASE) {
          pl -= p.actualLevel(bt - 1);
        } else if(l.multiplier === VM.LM_SUM || l.multiplier === VM.LM_MEAN) {
          for(let j = 0; j < ld; j++) {
            pl += p.actualLevel(b - j);
          }
          if(l.multiplier === VM.LM_MEAN && ld > 0) {
            pl /= (ld + 1);
          }
        } else if(l.multiplier === VM.LM_THROUGHPUT) {
          // NOTE: calculate throughput on basis of levels and rates,
          // as not all actual flows may have been computed yet
          pl = 0;
          for(let j = 0; j < p.inputs.length; j++) {
            pl += (p.inputs[j].from_node.actualLevel(bt) *
                   p.inputs[j].relative_rate.result(bt));
          }
        } else if(l.multiplier === VM.LM_PEAK_INC) {
          // Actual flow over "peak increase" link is zero unless...
          if(i === 0) {
            // first time step, then "block peak increase"...
            pl = p.b_peak_inc[block];
          } else if(i === MODEL.block_length) {
            // or first step of look-ahead, then "additional increase"
            pl = p.la_peak_inc[block];
          } else {
            pl = 0;
          }
        }
        // Preserve special values such as INF, UNDEFINED and VM error codes
        if(pl <= VM.MINUS_INFINITY || pl > VM.PLUS_INFINITY) {
          l.actual_flow[b] = pl;
        } else {
          const af = pl * l.relative_rate.result(bt);
          l.actual_flow[b] = (Math.abs(af) > VM.NEAR_ZERO ? af : 0);
        }
        b++;
      }
    }

    // THEN: calculate cash flows one step at a time because of delays
    b = bb;
    for(let i = 0; i < this.chunk_length; i++) {
      // Initialize cumulative cash flows for clusters
      for(let o in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(o) &&
          !MODEL.ignored_entities[o]) {
        const c = MODEL.clusters[o];
        c.cash_in[b] = 0;
        c.cash_out[b] = 0;
        c.cash_flow[b] = 0;
      }
      // NOTE: cash flows ONLY result from processes
      for(let o in MODEL.processes) if(MODEL.processes.hasOwnProperty(o) &&
          !MODEL.ignored_entities[o]) {
        const p = MODEL.processes[o];
        let ci = 0, co = 0;
        // INPUT links from priced products generate cash OUT...
        for(let j = 0; j < p.inputs.length; j++) {
          // NOTE: input links do NOT have a delay
          const l = p.inputs[j],
                af = l.actual_flow[b],
                fnp = l.from_node.price;
          if(af > VM.NEAR_ZERO && fnp.defined) {
            const pp = fnp.result(b);
            if(pp > 0 && pp < VM.PLUS_INFINITY) {
              co += pp * af;
            // ... unless the product price is negative; then cash IN
            } else if(pp < 0 && pp > VM.MINUS_INFINITY) {
              ci -= pp * af;
            }
          }
        }
        // OUTPUT links to priced products generate cash IN ...
        for(let j = 0; j < p.outputs.length; j++) {
          // NOTE: actual flows already consider delay
          const l = p.outputs[j],
                ld = l.actualDelay(b),
                af = l.actual_flow[b],
                tnp = l.to_node.price;
          if(af > VM.NEAR_ZERO && tnp.defined) {
            // NOTE: to get the correct price, again consider delays
            const pp = tnp.result(b - ld);
            if(pp > 0 && pp < VM.PLUS_INFINITY) {
              ci += pp * af;
            // ... unless the product price is negative; then cash OUT
            } else if(pp < 0 && pp > VM.MINUS_INFINITY) {
              co -= pp * af;
            }
          }
        }
        // Cash flows of process p are now known
        p.cash_in[b] = ci;
        p.cash_out[b] = co;
        p.cash_flow[b] = ci - co;
        // Also add these flows to all parent clusters of the process
        let c = p.cluster;
        while(c) {
          c.cash_in[b] += ci;
          c.cash_out[b] += co;
          c.cash_flow[b] += ci - co;
          c = c.cluster;
        }
      }
      b++;
    }
    
    // THEN: if cost prices should be inferred, calculate them one step at a
    // time because of delays, and also because expressions may refer to values
    // for earlier time steps
    if(MODEL.infer_cost_prices) {
      b = bb;
      for(let i = 0; i < this.chunk_length; i++) {
        if(!MODEL.calculateCostPrices(b)) {
          this.logMessage(block, `${this.WARNING}(t=${b}) ` +
              'Invalid cost prices due to negative flow(s)');
        }
        // move to the next time step of the block
        b++;
      }
    }

    // THEN: reset all datasets that serve as "formulas"
    for(let o in MODEL.datasets) if(MODEL.datasets.hasOwnProperty(o)) {
      const ds = MODEL.datasets[o];
      // NOTE: assume that datasets having modifiers but no data serve as
      // "formulas", i.e., expressions to be calculated AFTER a model run
      if(ds.data.length === 0) {
        for(let m in ds.modifiers) if(ds.modifiers.hasOwnProperty(m)) {
          ds.modifiers[m].expression.reset();
        }
      }
    }

    // THEN: reset the vectors of all chart variables
    for(let i = 0; i < MODEL.charts.length; i++) {
      MODEL.charts[i].resetVectors();
    }
    
    // Update the chart dialog if it is visible
    // NOTE: do NOT do this while an experiment is running, as this may
    // interfere with storing the run results
    if(!MODEL.running_experiment) {
      if(CHART_MANAGER.visible) CHART_MANAGER.updateDialog();
    }
    
    // NOTE: add a blank line to separate from next round (if any)
    this.logMessage(block,
        `Calculating dependent variables took ${this.elapsedTime} seconds.\n`);

    // FINALLY: reset the vectors of all note colors
    for(let o in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(o)) {
      const c = MODEL.clusters[o];
      for(let i = 0; i < c.notes.length; i++) {
        c.notes[i].color.reset();
      }
    }
  }
  
  showSetUpProgress(next_start, abl) {
    if(this.show_progress) {
      // NOTE: display 1 more segment progress so that the bar reaches 100%
      UI.setProgressNeedle((next_start + this.tsl) / abl);
    }
    setTimeout(
        function(t, n) { VM.addTableauSegment(t, n); }, 0, next_start, abl);
  }

  hideSetUpOrWriteProgress() {
    this.show_progress = false;
    UI.setProgressNeedle(0);
  }
  
  logCode() {
    // Prints VM instructions to console
    const arg = (a) => {
        if(a === null) return '';
        if(typeof a === 'number') return a + '';
        if(typeof a === 'string') return '"' + a + '"';
        if(typeof a === 'boolean') return (a ? 'TRUE' : 'FALSE');
        if(a instanceof Expression) return a.text;
        if(!Array.isArray(a)) {
          const n = a.displayName;
          if(n) return '[' + n + ']';
          return a.constructor.name;
        }
        let l = [];
        for(let i = 0; i < a.length; i++) l.push(arg(a[i]));
        return '(' + l.join(', ') + ')';
      };
    for(let i = 0; i < this.code.length; i++) {
      const vmi = this.code[i];
      let s = arg(vmi[1]);
      if(!s.startsWith('(')) s = '(' + s + ')';
      console.log((i + '').padStart(3, '0') + ':  ' + vmi[0].name + s);
    }
  }
  
  setupBlock() {
    if(DEBUGGING) this.logCode();
    const abl = this.actualBlockLength;
    // NOTE: tableau segment length is the number of time steps between
    // updates of the progress needle. The default progress needle interval
    // is calibrated for 1000 VMI instructions
    this.tsl = Math.ceil(CONFIGURATION.progress_needle_interval *
        1000 / this.code.length);
    if(abl > this.tsl * 5) {
      UI.setMessage('Constructing the Simplex tableau');
      UI.setProgressNeedle(0);
      this.show_progress = true;
    } else {
      this.show_progress = false;
    }
    setTimeout((n) => VM.initializeTableau(n), 0, abl);
  }
  
  resetTableau() {
    // Clears tableau data: matrix, rhs and constraint types
    // NOTE: this reset is called when initializing, and to free up
    // memory after posting a block to the server
    this.matrix.length = 0;
    this.right_hand_side.length = 0;
    this.constraint_types.length = 0;
  }
  
  initializeTableau(abl) {
    // `offset` is used to calculate the actual column index for variables
    this.offset = 0;
    // NOTE: vectors are "sparse" (i.e., will contain many 0) and are hence not
    // represented as arrays but as objects, e.g., {4:1.5, 8:0.3} to represent
    // an array [0, 0, 0, 1.5, 0, 0, 0, 0.3, 0, 0, 0, ...]
    // The keys can span the full chunk, so the objects represent vectors that
    // have a "virtual length" of cols * abl
    this.coefficients = {};
    this.cash_in_coefficients = {};
    this.cash_out_coefficients = {};
    // NOTE: cash flow equation coefficients may be divided by a scalar to keep
    // them amply below the base slack penalty; the scalar is increased by the
    // VM instruction  VMI_copy_cash_coefficients  so that at the end of the
    // block setup it equals the highest absolute coefficient in the cash flow
    // constraint equations; the VM maintains a list of indices of matrix rows
    // that then need to be scaled
    this.cash_scalar = 1;
    this.cash_constraints = [];
    this.objective = {};
    this.lower_bounds = {};
    this.upper_bounds = {};
    // NOTE: right-hand side of cash IN/OUT equations will always be 0 as the
    // actors' cash flows are calculated as C - a1P1 - a2P2 - ... anPn = 0
    this.rhs = 0;
    // NOTE: the constraint coefficient matrix and the rhs and ct vectors
    // have equal length (#rows); the matrix is a list of sparse vectors
    this.resetTableau();
    // NOTE: setupBlock only works properly if setupProblem was successful
    // Every variable gets one column per time step => tableau is organized
    // in segments per time step, where each segment has `cols` columns
    this.cols = this.variables.length;
    // The "chunk variables" are unique per block, and hence have their
    // own segment; as the chunk length for the last block can be shorter,
    // the offset of this segment is recorded here so it can be used
    // by VM instructions
    // NOTE: add 1, as chunk variable list is zero-based
    this.chunk_offset = this.cols * abl + 1;
    // Set list with indices of integer variables
    this.is_integer = {};
    for(let i in this.int_var_indices) if(Number(i)) {
      for(let j = 0; j < abl; j++) {
        this.is_integer[parseInt(i) + j*this.cols] = true;
      }
    }
    // Set list with indices of binary variables
    this.is_binary = {};
    for(let i in this.bin_var_indices) if(Number(i)) {
      for(let j = 0; j < abl; j++) {
        this.is_binary[parseInt(i) + j*this.cols] = true;
      }
    }
    // Set list with indices of semi-contiuous variables
    this.is_semi_continuous = {};
    for(let i in this.sec_var_indices) if(Number(i)) {
      for(let j = 0; j < abl; j++) {
        this.is_semi_continuous[parseInt(i) + j*this.cols] = true;
      }
    }
    // Initialize the "add constraints flag" to TRUE
    // NOTE: this flag can be set/unset dynamically by VM instructions
    this.add_constraints_flag = true;    
    // Execute code for each time step in this block
    this.logTrace('START executing block code (' +
        pluralS(this.code.length, ' instruction)'));
    // NOTE: `t` is the VM's "time tick", which is "relative time" compared to
    // the "absolute time" of the simulated period. VM.t always starts at 1,
    // which corresponds to MODEL.start_period
    this.t = (this.block_count - 1) * MODEL.block_length + 1;
    // Show this relative (!) time step on the status bar as progress indicator
    UI.updateTimeStep(this.t);
    setTimeout((t, n) => VM.addTableauSegment(t, n), 0, 0, abl);
  }
  
  addTableauSegment(start, abl) {
    if(VM.halted) {
      this.hideSetUpOrWriteProgress();
      this.stopSolving();
      return;
    }
    // NOTE: save an additional call when less than 20% of a segment would remain
    var l;
    const next_start = (start + this.tsl * 1.2 < abl ? start + this.tsl : abl);
    for(let i = start; i < next_start; i++) {
      this.logTrace('EXECUTE for t=' + this.t);
      l = this.code.length;
      for(let j = 0; j < l; j++) {
        this.IP = j;
        // Execute the instruction, which has form [function, argument list]
        const instr = this.code[j];
        instr[0](instr[1]);
        // Trace the result when debugging
        this.logTrace([('    ' + j).slice(-5), ': coeff = ',
            JSON.stringify(this.coefficients), ';  rhs = ', this.rhs].join(''));
      }
      this.logTrace('STOP executing block code');
      // Add constraints for paced process variables
      // NOTE: this is effectuated by *executing* VM instructions
      for(let j in this.paced_var_indices) if(Number(j)) {
        const
            // p is the pace (number of time steps)
            p = this.paced_var_indices[j],
            // The delay equals the remainder of the division t-1 / pace
            d = (this.t - 1) % p;
        if(d > 0) {
          // Value of variable X[t] should be equal to X[t-d],
          // so add constraint X[t] - [Xt-d] = 0
          // NOTES:
          // (1) j is array index and interpreted as string unless converted
          // (2) start-up and first commit should be 0 for all d > 0, as the
          //     start-up of a paced variable only applies to the time step in
          //     which it *can* change
          // (3) 
          const jv = parseInt(j);
          VMI_clear_coefficients(null);
          VMI_add_const_to_coefficient([jv, 1]);
          if('SU|FC'.indexOf(this.variables[jv - 1][0]) < 0) {
            VMI_add_const_to_coefficient([jv, -1, d]);
          }
          VMI_add_constraint(VM.EQ);
        }
      }
      // Proceed to the next time tick
      this.t++;
      // This also means advancing the offset, because all VM instructions
      // pass variable indices relative to the first column in the tableau
      this.offset += this.cols;
    }
    if(next_start < abl) {
      setTimeout((t, n) => VM.showSetUpProgress(t, n), 0, next_start, abl);
    } else {
      UI.setProgressNeedle(0);
      setTimeout((n) => VM.finishBlockSetup(n), 0, abl);
    }
  }
    
  finishBlockSetup(abl) {
    // Scale the coefficients of the objective function, and calculate
    // the "base" slack penalty
    this.scaleObjective();
    this.scaleCashFlowConstraints();
    // Add (appropriately scaled!) slack penalties to the objective function
    // NOTE: penalties must become negative coefficients (solver MAXimizes!)
    let p = -1,
        hsp = 0;
    // Index i iterates over types of slack variable: 0 = market demand (EQ),
    // 1 = LE and GE bound constraints, 2 = highest (data, composite constraints)
    for(let i = 0; i <= 2; i++) {
      const svl = this.slack_variables[i];
      let l = svl.length;
      for(let j = 0; j < l; j++) {
        for(let k = 0; k < abl; k++) {
          hsp = this.slack_penalty * p;
          this.objective[svl[j] + k*this.cols] = hsp;
        }
      }
      // For the next type of slack, double the penalty 
      p *= 2;
    }
    this.hideSetUpOrWriteProgress();
    const bc = this.block_count;
    this.logMessage(bc, `Highest slack penalty =  ${this.sig4Dig(hsp)}`);
    this.logMessage(bc, 'Set-up ('+
        pluralS(this.code.length, 'VM instruction') + ') took ' +
        this.elapsedTime + ' seconds.');
    UI.setMessage(`Solving block ${bc}${this.supRound} of ${this.nr_of_blocks}`);
    setTimeout(() => VM.solveBlock(), 0);
  }
  
  setNumericIssue(n, p, where) {
    let vbl;
    if(p >= this.chunk_offset) {
      vbl = this.chunk_variables[p - this.chunk_offset];
    } else {
      // NOTE: variables is zero-based, hence p-1
      vbl = this.variables[(p-1) % this.cols];
    }
    this.numeric_issue = where + ' for ' + vbl[1].name +
        ' (' + vbl[0] + ', bt=' + Math.floor((p-1) / this.cols + 1) + ')';
    // NOTE: numeric issues are detected on ABSOLUTE values, while error codes
    // are extreme negative values => negate when greater than the special
    // values VM.UNDEFINED, VM.NOT_COMPUTED and VM.COMPUTING
    if(-n <= VM.ERROR) n = -n;
    let err = this.errorMessage(n);
    if(err === n) {
      err = 'value = ' + n;
    } else if(this.error_codes.indexOf(n) < 0) {
      err += '? value = ' + n;
    }
    this.logMessage(this.block_count, err);
    UI.alert(err);
  }
  
  get actualBlockLength() {
    // The actual block length is the number of time steps to be considered by
    // the solver; the abl of the last block is likely to be shorter than the
    // standard, as it should not go beyond the end time, assuming that
    // parameter data are undefined beyond this end time
    if(this.block_count < this.nr_of_blocks) return this.chunk_length;
    return (MODEL.end_period - MODEL.start_period + 1) -
        (this.block_count - 1) * MODEL.block_length;
  }
  
  get columnsInBlock() {
    // Returns the actual block length plus the number of chunk variables
    return this.actualBlockLength * this.cols + this.chunk_variables.length;
  }
  
  writeLpFormat(cplex=false) {
    // NOTE: actual block length `abl` of last block is likely to be
    // shorter than the standard, as it should not go beyond the end time


    const
        abl = this.actualBlockLength,
        // Get the number digits for variable names
        z = this.columnsInBlock.toString().length,
        // LP_solve uses semicolon as separator between equations
        EOL = (cplex ? '\n' : ';\n'),
        // Local function that returns variable symbol (e.g. X001) with
        // its coefficient if specified (e.g., -0.123 X001) in the
        // most compact notation
        vbl = (index, c=false) => {
            const v = 'X' + index.toString().padStart(z, '0');
            if(c === false) return v; // Only the symbol
            if(c === -1) return ` -${v}`; // No coefficient needed
            if(c < 0) return ` ${c} ${v}`; // Number had minus sign
            if(c === 1) return ` +${v}`; // No coefficient needed
            return ` +${c} ${v}`; // Prefix coefficient with +
            // NOTE: this may return  +0 X001
          };

    this.numeric_issue = '';
    // First add the objective (always MAXimize)
    if(cplex) {
      this.lines = 'Maximize\n';
    } else {
      this.lines = '/* Objective function */\nmax:\n';
    }
    let c,
        p,
        line = '';
    // NOTE: iterate over ALL columns to maintain variable order
    let n = abl * this.cols + this.chunk_variables.length;
    for(p = 1; p <= n; p++) {
      if(this.objective.hasOwnProperty(p)) {
        c = this.objective[p];
        // Check for numeric issues 
        if (c < VM.MINUS_INFINITY || c > VM.PLUS_INFINITY) {
          this.setNumericIssue(c, p, 'objective function coefficient');
          break;
        }
        line += vbl(p, c);
      }
      // Keep lines under approx. 110 chars
      if(line.length >= 100) {
        this.lines += line + '\n';
        line = '';
      }
    }
    this.lines += line + EOL;
    line = '';
    // Add the row constraints
    if(cplex) {
      this.lines += '\nSubject To\n';
    } else {
      this.lines += '\n/* Constraints */\n';
    }
    n = this.matrix.length;
    for(let r = 0; r < n; r++) {
      const row = this.matrix[r];
      for(p in row) if (row.hasOwnProperty(p)) {
        c = row[p];
        if (c < VM.SOLVER_MINUS_INFINITY || c > VM.SOLVER_PLUS_INFINITY) {
          this.setNumericIssue(c, p, 'constraint coefficient');
          break;
        }
        line += vbl(p, c);
        // Keep lines under approx. 110 chars
        if(line.length >= 100) {
          this.lines += line + '\n';
          line = '';
        }
      }
      c = this.right_hand_side[r];
      this.lines += line + ' ' +
          this.constraint_symbols[this.constraint_types[r]] + ' ' + c + EOL;
      line = '';
    }
    // Add the variable bounds
    if(cplex) {
      this.lines += '\nBounds\n';
    } else {
      this.lines += '\n/* Variable bounds */\n';
    }
    n = abl * this.cols;
    for(p = 1; p <= n; p++) {
      let lb = null,
          ub = null;
      if(this.lower_bounds.hasOwnProperty(p)) {
        lb = this.lower_bounds[p];
        // NOTE: for bounds, use the SOLVER values for +/- Infinity
        if (lb < VM.SOLVER_MINUS_INFINITY || lb > VM.SOLVER_PLUS_INFINITY) {
          this.setNumericIssue(lb, p, 'lower bound');
          break;
        }
      }
      if(this.upper_bounds.hasOwnProperty(p)) {
        ub = this.upper_bounds[p];
        if (ub < VM.SOLVER_MINUS_INFINITY || ub > VM.SOLVER_PLUS_INFINITY) {
          this.setNumericIssue(c, p, 'upper bound');
          break;
        }
      }
      line = '';
      if(lb === ub) {
        if(lb !== null) line = ` ${vbl(p)} = ${lb}`;
      } else {
        // NOTE: by default, lower bound of variables is 0
        line = ` ${vbl(p)}`;
        if(cplex) {
          // Explicitly denote free variables
          if(lb === null && ub === null && !this.is_binary[p]) {
            line += ' free';
          } else {
            // Separate lines for LB and UB if specified
            if(ub !== null) line += ' <= ' + ub;
            if(lb !== null && lb !== 0) line += `\n ${vbl(p)} >= ${lb}`;
          }
        } else {
          // Bounds can be specified on a single line: lb <= X001 <= ub
          if(lb !== null && lb !== 0) line = lb + ' <= ' + line;
          if(ub !== null) line += ' <= ' + ub;
        }
      }
      if(line) this.lines += line + EOL;
    }
    // Add the special variable types
    if(cplex) {
      line = '';
      let scv = 0;
      for(let i in this.is_binary) if(Number(i)) {
        line += ' ' + vbl(i);
        scv++;
        // Max. 10 variables per line
        if(scv >= 10) line += '\n';
      }
      if(scv) {
        this.lines += `Binary\n${line}\n`;
        line = '';
        scv = 0;
      }
      for(let i in this.is_integer) if(Number(i)) {
        line += ' ' + vbl(i);
        scv++;
        // Max. 10 variables per line
        if(scv >= 10) line += '\n';
      }
      if(scv) {
        this.lines += `General\n${line}\n`;
        line = '';
        scv = 0;
      }
      for(let i in this.is_semi_continuous) if(Number(i)) {
        line += ' '+ vbl(i);
        scv++;
        // Max. 10 variables per line
        if(scv >= 10) line += '\n';
      }
      if(scv) {
        this.lines += `Semi-continuous\n${line}\n`;
        line = '';
        scv = 0;
      }
      if(this.sos_var_indices.length > 0) {
        this.lines += 'SOS\n';
        let sos = 0;
        const v_set = [];
        for(let j = 0; j < abl; j++) {
          for(let i = 0; i < this.sos_var_indices.length; i++) {
            v_set.length = 0;
            let vi = this.sos_var_indices[i][0] + j * this.cols;
            const n = this.sos_var_indices[i][1];
            for(let j = 1; j <= n; j++)  {
              v_set.push(`${vbl(vi)}:${j}`);
              vi++;
            }
            this.lines += ` s${sos}: S2:: ${v_set.join(' ')}\n`;
            sos++;
          }
        }
      }
      this.lines += 'End';
    } else {
      // NOTE: LP_solve does not differentiate between binary and integer,
      // so for binary variables, the constraint <= 1 must be added
      const v_set = [];
      for(let i in this.is_binary) if(Number(i)) {
        const v = vbl(i);
        this.lines += `${v} <= 1;\n`;
        v_set.push(v);
      }
      for(let i in this.is_integer) if(Number(i)) v_set.push(vbl(i));
      if(v_set.length > 0) this.lines += 'int ' + v_set.join(', ') + ';\n';
      // Clear the INT variable list
      v_set.length = 0;
      // Add the semi-continuous variables
      for(let i in this.is_semi_continuous) if(Number(i)) v_set.push(vbl(i));
      if(v_set.length > 0) this.lines += 'sec ' + v_set.join(', ') + ';\n';
      // Add the SOS section
      if(this.sos_var_indices.length > 0) {
        this.lines += 'sos\n';
        let sos = 1;
        for(let j = 0; j < abl; j++) {
          for(let i = 0; i < this.sos_var_indices.length; i++) {
            v_set.length = 0;
            let vi = this.sos_var_indices[i][0] + j * this.cols;
            const n = this.sos_var_indices[i][1];
            for(let j = 1; j <= n; j++)  {
              v_set.push(vbl(vi));
              vi++;
            }
            this.lines += `SOS${sos}: ${v_set.join(',')} <= 2;\n`;
            sos++;
          }
        }
      }
    }
    setTimeout(() => VM.submitFile(), 0);
  }
  
  rowToEquation(row, ct, rhs) {
    const eq = [];
    for(let p in row) if (row.hasOwnProperty(p)) {
      const
          c = this.sig4Dig(row[p]),
          vi = p % this.cols,
          t = Math.floor(p / this.cols);
      eq.push(c + ' ' + this.variables[vi][1].displayName + ' ' +
        this.variables[vi][0] + ' [' + t + ']');
    }
    return eq.join(' + ') + ct + ' ' + this.sig4Dig(rhs);
  }

  writeMPSFormat() {
    // Write model code lines in MPS format
    // NOTE: for each column a separate list
    // NOTE: columns are numbered from 1 to N, hence dummy list for c=0
    const
        abl = this.actualBlockLength,
        cols = [[]],
        rhs = [];
    let nrow = this.matrix.length,
        ncol = abl * this.cols + this.chunk_variables.length,
        c,
        p,
        r;
    this.numeric_issue = '';
    this.lines = '';
    for(c = 1; c <= ncol; c++) cols.push([]);
    this.decimals = Math.max(nrow, ncol).toString().length;
    this.lines += 'NAME block-' + this.blockWithRound + '\nROWS\n';
    // Start with the "free" row that will be the objective function
    this.lines += ' N  OBJ\n';
    for(r = 0; r < nrow; r++) {
      const
          row = this.matrix[r],
          row_lbl = 'R' + (r + 1).toString().padStart(this.decimals, '0');
      this.lines += ' ' + this.constraint_letters[this.constraint_types[r]] +
          '  ' + row_lbl + '\n';
      for(p in row) if (row.hasOwnProperty(p)) {
        c = row[p];
        // Check for numeric issues 
        if(c === undefined || c < VM.SOLVER_MINUS_INFINITY ||
            c > VM.SOLVER_PLUS_INFINITY) {
          this.setNumericIssue(c, p, 'constraint');
          break;
        }
        if(p >= cols.length) {
          console.log('Bad column number p', p, row_lbl, c);
        }
        cols[p].push(row_lbl + ' ' + c);
      }
      c = this.right_hand_side[r];
      if(c === undefined || c === null ||
          c < VM.SOLVER_MINUS_INFINITY || c > VM.SOLVER_PLUS_INFINITY) {
        this.setNumericIssue(c, p, 'right-hand side');
      } else {
        rhs.push('    B ' + row_lbl + ' ' + c);
      }
    }
    // The objective function is a row like those for the constraints
    for(p in this.objective) if(this.objective.hasOwnProperty(p)) {
      c = this.objective[p];
      if(c === null || c < VM.MINUS_INFINITY || c > VM.PLUS_INFINITY) {
        this.setNumericIssue(c, p, 'objective function coefficient');
        break;
      }
      // NOTE: MPS assumes MINimization, hence negate all coefficients
      // NOTE: JavaScript differentiates between 0 and -0, so add 0 to prevent
      // creating the special numeric value -0
      cols[p].push('OBJ ' + (-c + 0));
    }
    // Abort if any invalid coefficient was detected
    if(this.numeric_issue) {
      this.hideSetUpOrWriteProgress();
      this.stopSolving();
      return;
    }
    // Add the columns section
    this.lines += 'COLUMNS\n';
    for(c = 1; c <= ncol; c++) {
      const col_lbl = '    X' + c.toString().padStart(this.decimals, '0') + '  ';
      // NOTE: if processes have no in- or outgoing links their decision
      // variable does not occur in any constraint, and this may cause
      // problems for solvers that cannot handle columns having a blank
      // row name (e.g., CPLEX). To prevent errors, these columns are
      // given coefficient 0 in the OBJ row
      if(cols[c].length) {
        this.lines += col_lbl + cols[c].join('\n' + col_lbl) + '\n';
      } else {
        this.lines += col_lbl + ' OBJ 0\n';
      }
    }
    // Free up memory
    cols.length = 0;
    // Add the RHS section
    this.lines += 'RHS\n' + rhs.join('\n') + '\n';
    rhs.length = 0;
    // Add the BOUNDS section
    this.lines += 'BOUNDS\n';
    // NOTE: start at column number 1 (not 0)
    setTimeout((c, n) => VM.showMPSProgress(c, n), 0, 1, ncol);
  }
  
  showMPSProgress(next_col, ncol) {
    if(VM.halted) {
      this.hideSetUpOrWriteProgress();
      this.stopSolving();
      return;
    }
    if(this.show_progress) {
      // NOTE: display 1 block more progress, or the bar never reaches 100%
      UI.setProgressNeedle((next_col + this.cbl) / ncol);
    }
    setTimeout((c, n) => VM.writeMPSColumns(c, n), 0, next_col, ncol);
  }
  
  writeMPSColumns(col, ncol) {
    let p,
        bnd,
        lbc,
        ubc,
        semic;
    const next_col = Math.min(col + this.cbl, ncol) + 1;
    for(p = col; p < next_col; p++) {
      let lb = null,
          ub = null;
      if(this.lower_bounds.hasOwnProperty(p)) {
        lb = this.lower_bounds[p];
        // NOTE: for bounds, use the SOLVER values for +/- Infinity
        if(lb < VM.SOLVER_MINUS_INFINITY || lb > VM.PLUS_INFINITY) {
          this.setNumericIssue(lb, p, 'lower bound');
          break;
        }
      }
      if(this.upper_bounds.hasOwnProperty(p)) {
        ub = this.upper_bounds[p];
        if(ub < VM.SOLVER_MINUS_INFINITY || ub > VM.SOLVER_PLUS_INFINITY) {
          this.setNumericIssue(ub, p, 'upper bound');
          break;
        }
      }
      bnd = ' BND  X' + p.toString().padStart(this.decimals, '0') + '  ';
      /* Gurobi uses these MPS format bound types:
          LO 	lower bound
          UP 	upper bound
          FX 	variable is fixed at the specified value
          FR 	free variable (no lower or upper bound)
          MI 	infinite lower bound
          PL 	infinite upper bound
          BV 	variable is binary (equal 0 or 1)
          LI 	lower bound for integer variable
          UI 	upper bound for integer variable
          SC 	upper bound for semi-continuous variable
          SI 	upper bound for semi-integer variable
      */
      semic = p in this.is_semi_continuous;
      if(p in this.is_binary) {
        this.lines += ' BV' + bnd + '\n';
      } else if(lb !== null && ub !== null && lb <= VM.SOLVER_MINUS_INFINITY &&
          ub >= VM.SOLVER_PLUS_INFINITY) {
        this.lines += ' FR' + bnd + '\n';
      } else if(lb !== null && lb === ub && !semic) {
        this.lines += ' FX' + bnd + lb + '\n';
      } else {
        // Assume "standard" bounds
        lbc = ' LO';
        ubc = ' UP';
        if(p in this.is_integer) {
          lbc = ' LI';
          ubc = (semic ? ' SI' : ' UI');
          if(lb === null) lb = 0;
          if(ub === null) ub = Number.MAX_SAFE_INTEGER;
        } else if(semic) {
          ubc = ' SC';
        }
        // NOTE: by default, lower bound of variables is 0
        if(lb !== null && lb !== 0 || lbc !== ' LO') {
          this.lines += lbc + bnd + lb + '\n';
        }
        if(ub !== null) {
          this.lines += ubc + bnd + ub + '\n';
        }
      }
    }
    // Abort if any invalid coefficient was detected
    if(this.numeric_issue) this.submitFile();
    if(next_col <= ncol) {
      setTimeout((c, n) => VM.showMPSProgress(c, n), 0, next_col, ncol);
    } else {
      UI.setProgressNeedle(0);
      setTimeout(() => VM.writeLastMPSLines(), 0);
    }
  }
  
  writeLastMPSLines() {
    this.hideSetUpOrWriteProgress();
    // Add the SOS section
    if(this.sos_var_indices.length > 0) {
      this.lines += 'SOS\n';
      const abl = this.actualBlockLength;
      let sos = 1;
      for(let j = 0; j < abl; j++) {
        for(let i = 0; i < this.sos_var_indices.length; i++) {
          this.lines += ' S2 sos' + sos + '\n';
          let vi = this.sos_var_indices[i][0] + j * this.cols;
          const n = this.sos_var_indices[i][1];
          for(let j = 1; j <= n; j++) {
            const s = '    X' + vi.toString().padStart(this.decimals, '0') +
                '          ';
            this.lines += s.substring(0, 15) + j + '\n';
            vi++;
          }
          sos++;
        }
      }
    }
    // Add the end-of-model marker
    this.lines += 'ENDATA';
    setTimeout(() => VM.submitFile(), 0);
  }
  
  get noSolutionStatus() {
    // Returns set of status codes that indicate that solver did not return
    // a solution (so look-ahead should be conserved)
    if(this.solver_name === 'lp_solve') {
      return [-2, 2, 6];
    } else if(this.solver_name === 'gurobi') {
      return [1, 3, 4, 6, 11, 12, 14];
    } else {
      return [];
    }
  }
  
  checkLicense() {
    // Compares license expiry date (if set) with current time, and notifies
    // when three days or less remain
    if(this.license_expires && this.license_expires.length) {
      // NOTE: expiry date has YYYY-MM-DD format
      const
          xds = this.license_expires[0].slice(-10).split('-'),
          y = parseInt(xds[0]),
          m = parseInt(xds[1]),
          d = parseInt(xds[2]),
          xdate = new Date(Date.UTC(y, m-1, d)),
          time_left = xdate - Date.now(),
          three_days = 3*24*3.6e+6;
      if(time_left < three_days) {
        const
            opts = {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'},
            lds = ' (' + xdate.toLocaleDateString(undefined, opts) + ')';
        UI.notify('Solver license will expire in less than 3 days' + lds);
      }
    }
  }

  stopSolving() {
    this.stopTimer();
    UI.stopSolving();
  }
  
  processServerResponse(json) {
    // Response object (parsed JSON) has these properties:
    // - error: error message (empty string => OK)
    // - status: the solver exit code
    // - model: the MILP equations in LP format
    // - data: data object {block, round, x}
    let msg = '';
    // NOTE: block number is passed as string => convert to integer
    const
        bnr = safeStrToInt(json.data.block),
        rl = json.data.round,
        et = this.elapsedTime;
    this.round_times.push(et);
    this.round_secs.push(json.data.seconds);
    this.logMessage(bnr, `Solving block #${bnr}${rl} took ${et} seconds.
Solver status = ${json.status}`);
    if(json.messages) {
      msg = json.messages.join('\n');
      // Check whether Gurobi version is at least version 9.5
      let gv = msg.match(/Gurobi \d+\.\d+\.\d+/);
      if(gv) {
        gv = gv[0].split(' ')[1].split('.');
        const major = parseInt(gv[0]);
        if(major < 9 || (major === 9 && parseInt(gv[1]) < 5)) {
          UI.alert('Gurobi version is too old -- upgrade to 9.5 or higher');
        }
      }
      // NOTE: server script adds a license expiry notice for the Gurobi solver
      this.license_expires = msg.match(/ expires \d{4}\-\d{2}\-\d{2}/);
    }
    if(json.error) {
      const errmsg = 'Solver error: ' + json.error;
      if(errmsg.indexOf('license') >= 0 && errmsg.indexOf('expired') >= 0) {
        this.license_expired += 1;
      }
      this.logMessage(bnr, errmsg);
      UI.alert(errmsg);
    }
    this.logMessage(bnr, msg);
    this.equations[bnr - 1] = json.model;
    if(DEBUGGING) console.log(json.data);
    // Store the results in the decision variable vectors (production levels
    // and stock level), but do NOT overwrite "look-ahead" levels if this block
    // was not solved (indicated by the 4th parameter that tests the status)
    // NOTE: appropriate status codes are solver-dependent
    this.setLevels(bnr, rl, json.data.x,
      this.noSolutionStatus.indexOf(json.status) >= 0);
    // NOTE: Post-process levels only AFTER the last round!
    if(rl === this.lastRound) {
      // Calculate data for all other dependent variables
      this.calculateDependentVariables(bnr);    
      // Add progress bar segment only now, knowing status AND slack use
      const issue = json.status !== 0 || this.error_count > 0;
      if(issue) this.block_issues++;
      // NOTE: in case of multiple rounds, use the sum of the round times
      const time = this.round_times.reduce((a, b) => a + b, 0);
      this.round_times.length = 0;
      this.solver_times[bnr - 1] = time;
      this.solver_secs[bnr - 1] = this.round_secs.reduce((a, b) => a + b, 0);
      this.round_secs.length = 0;
      MONITOR.addProgressBlock(bnr, issue, time);
    }
    // Free up memory
    json = null;
  }

  solveBlocks() {
    // Check if blocks remain to be done; if not, redraw the graph and exit
    // NOTE: set IF-condition to TRUE for testing WITHOUT computation
    if(this.halted || this.block_count > this.nr_of_blocks) {
      // Set current time step to 1 (= first time step of simulation period)
      MODEL.t = 1;
      this.stopSolving();
      MODEL.solved = true;
      this.checkLicense();
      UI.drawDiagram(MODEL);
      // Show the reset button (GUI only)
      UI.readyToReset();
      if(MODEL.running_experiment) {
       // If experiment is active, signal the manager.
        EXPERIMENT_MANAGER.processRun();
      } else if(RECEIVER.solving || MODEL.report_results) {
        // Otherwise report results now, if applicable.
        RECEIVER.report();
      }
      // Warn modeler if any issues occurred
      if(this.block_issues) {
        let msg = 'Issues occurred in ' +
            pluralS(this.block_issues, 'block') +
            ' -- details can be viewed in the monitor';
        if(VM.issue_list.length) {
          msg += ' and by using \u25C1 \u25B7';
        }
        UI.warn(msg);
        UI.updateIssuePanel();
      }
      if(this.license_expired > 0) {
        // Special message to draw attention to this critical error
        UI.alert('SOLVER LICENSE EXPIRED: Please check!');
      }
      // Call back to the console (if callback hook has been set)
      if(this.callback) this.callback(this);
      return;
    }
    const bwr = this.blockWithRound;
    MONITOR.updateBlockNumber(bwr);
    // NOTE: add blank line to message to visually separate rounds
    this.logMessage(this.block_count, '\nSetting up block #' + bwr);
    UI.logHeapSize('Before set-up of block #' + bwr);
    this.setupBlock();
  }
  
  solveBlock() {
    if(this.halted) {
      this.stopSolving();
      this.logMessage(this.block_count, 'Set-up aborted');
      return;
    }
    if(this.cols === 0) {
      this.stopSolving();
      this.logMessage(this.block_count, 'Zero columns -- nothing to solve');
      return;
    }
    this.logMessage(this.block_count,
        'Creating model for block #' + this.blockWithRound);
    this.cbl = CONFIGURATION.progress_needle_interval * 200;
    if(this.cols * MODEL.block_length > 5 * this.cbl) {
      UI.setProgressNeedle(0);
      this.show_progress = true;
    } else {
      this.show_progress = false;
    }
    // Generate lines of code in format that should be accepted by solver
    if(this.solver_name === 'gurobi') {
      this.writeMPSFormat();
    } else if(this.solver_name === 'scip' || this.solver_name === 'cplex') {
      // NOTE: the CPLEX LP format that is also used by SCIP differs from
      // the LP_solve format that was used by the first versions of Linny-R;
      // TRUE indicates "CPLEX format"
      this.writeLpFormat(true);
    } else if(this.solver_name === 'lp_solve') {
      this.writeLpFormat(false);
    } else {
      this.numeric_issue = 'solver name: ' + this.solver_name;
    }
  }  

  submitFile() {
    // Prepares to POST the model file (LP or MPS) to the Linny-R server
    // NOTE: the tableau is no longer needed, so free up its memory
    this.resetTableau();
    if(this.numeric_issue) {
      const msg = 'Invalid ' + this.numeric_issue;
      this.logMessage(this.block_count, msg);
      UI.alert(msg);
      this.stopSolving();
    } else {
      // Log the time it took to create the code lines
      this.logMessage(this.block_count,
          'Model file creation (' + UI.sizeInBytes(this.lines.length) +
              ') took ' + this.elapsedTime + ' seconds.');
      // NOTE: monitor will use (and then clear) VM.lines, so no need
      // to pass it on as parameter
      MONITOR.submitBlockToSolver();
      // Now the round number can be increased...
      this.current_round++;
      // ... and also the blocknumber if all rounds have been played
      if(this.current_round >= this.round_sequence.length) {
        this.current_round = 0;
        this.block_count++;
      }
    }
  }
  
  solve() {
    // Compiles model to VM code and starts sequence of solving blocks
    UI.logHeapSize('Before model reset');
    this.reset();
    UI.logHeapSize('After model reset');
    this.startTimer();
    this.setupProblem();
    UI.logHeapSize('After problem set-up');
    if(this.max_tableau_size) {
      if(this.nr_of_blocks * MODEL.block_length > this.max_tableau_size) {
        UI.warn('Simulation will exceed resource limits set for this server ' +
            '-- change model settings');
        this.stopSolving();
        return;
      } else if(this.max_blocks && this.nr_of_blocks > this.max_blocks) {
        UI.warn('Too may blocks to run on this server -- increase block length');
        this.stopSolving();
        return;
      }
    }
    UI.rotatingIcon(true);
    this.solveBlocks();
  }
  
  solveModel() {
    // Starts the sequence of data loading, model translation, solving
    // consecutive blocks, and finally calculating dependent variables
    const n = MODEL.loading_datasets.length;
    if(n > 0) {
      // Still within reasonable time? (3 seconds per dataset)
      if(MODEL.max_time_to_load > 0) {
        // Report progress on the status bar (just plain text)
        UI.setMessage(`Waiting for ${pluralS(n, 'dataset')} to load`);
        // Decrease the remaining time to wait (half second units)
        MODEL.max_time_to_load--;
        // Try again after half a second
        setTimeout(() => VM.solveModel(), 500);
        return;
      } else {
        // Wait no longer, but warn user that data may be incomplete
        const dsl = [];
        for(let i = 0; i < MODEL.loading_datasets.length; i++) {
          dsl.push(MODEL.loading_datasets[i].displayName);
        }
        UI.warn('Loading of ' + pluralS(dsl.length, 'dataset') + ' (' +
            dsl.join(', ') + ') takes too long');
      }
    }
    if(MONITOR.connectToServer()) {
      UI.startSolving();
      if(RECEIVER.active) RECEIVER.solving = true;
      VM.reset();
      VM.solve();
    }
  }
  
  halt() {
    // Aborts solving process (prevents submitting next block)
    UI.waitToStop();
    this.halted = true;
  }

}  // END of class VirtualMachine


// Functions implementing Virtual Machine Instructions (hence prefix VMI)

// Linny-R features two types of virtual machine:
// (1) A stack automaton for calculation of arithmetical expressions
// (2) A "vector processor" for configuration of a Simplex tableau,
//     and communication with a server-side MILP solver
  
// All Virtual Machine instructions (VMI) are 2-element arrays
// [function, argument list]

// STACK AUTOMATON INSTRUCTIONS
// Properties of Linny-R entities are either numbers (constant values)
// or expressions. To allow lazy evaluation of expressions, each expression
// has its own stack automaton. This automaton computes the expression
// result by consecutively executing the instructions in the expression's
// code array. Execution of instruction [f, a] means calling f(x, a),
// where x is the computing expression instance. Hence, each VMI stack
// automaton instruction has parameters x and a, where x is the computing
// expression and a the argument, which may be a single number or a list
// (array) of objects. When no arguments need to be passed, the second
// parameter is named 'empty' (and is not used).

function VMI_push_number(x, number) {
  // Pushes a numeric constant on the VM stack
  if(DEBUGGING) console.log('push number = ' + number);
  x.push(number);
}

function VMI_push_time_step(x, empty) {
  // Pushes the current time step.
  // NOTE: this is the "local" time step for expression `x` (which always
  // starts at 1), adjusted for the first time step of the simulation period 
  const t = x.step[x.step.length - 1] + MODEL.start_period - 1; 
  if(DEBUGGING) console.log('push absolute t = ' + t);
  x.push(t);
}

function VMI_push_delta_t(x, empty) {
  // Pushes the duration of 1 time step (in hours).
  const dt = MODEL.time_scale * VM.time_unit_values[MODEL.time_unit]; 
  if(DEBUGGING) console.log('push delta-t = ' + dt);
  x.push(dt);
}

function VMI_push_relative_time(x, empty) {
  // Pushes the "local" time step for expression `x` (which always starts at 1)
  const t = x.step[x.step.length - 1]; 
  if(DEBUGGING) console.log('push relative t = ' + t);
  x.push(t);
}

function VMI_push_block_time(x, empty) {
  // Pushes the "local" time step for expression `x` (which always starts at 1)
  // adjusted for the first time step of the current block
  const lt = x.step[x.step.length - 1] - 1,
        bnr = Math.floor(lt / MODEL.block_length),
        t = lt - bnr * MODEL.block_length + 1; 
  if(DEBUGGING) console.log('push block time bt = ' + t);
  x.push(t);
}

function VMI_push_block_number(x, empty) {
  // Pushes the block currently being optimized (block numbering starts at 1)
  const local_t = x.step[x.step.length - 1] - 1,
        bnr = Math.floor(local_t / MODEL.block_length) + 1;
  if(DEBUGGING) console.log('push current block number = ' + bnr);
  x.push(bnr);
}

function VMI_push_run_length(x, empty) {
  // Pushes the run length (excl. look-ahead!)
  const n = MODEL.end_period - MODEL.start_period + 1;
  if(DEBUGGING) console.log('push run length N = ' + n);
  x.push(n);
}

function VMI_push_block_length(x, empty) {
  // Pushes the block length (is set via model settings dialog)
  if(DEBUGGING) console.log('push block length n = ' + MODEL.block_length);
  x.push(MODEL.block_length);
}

function VMI_push_look_ahead(x, empty) {
  // Pushes the look-ahead
  if(DEBUGGING) console.log('push look-ahead l = ' + MODEL.look_ahead);
  x.push(MODEL.look_ahead);
}

function VMI_push_round(x, empty) {
  // Pushes the current round number (a=1, z=26, etc.)
  const r = VM.round_letters.indexOf(VM.round_sequence[VM.current_round]);
  if(DEBUGGING) console.log('push round number R = ' + r);
  x.push(r);
}

function VMI_push_last_round(x, empty) {
  // Pushes the last round number (a=1, z=26, etc.)
  const r = VM.round_letters.indexOf(VM.round_sequence[MODEL.rounds - 1]);
  if(DEBUGGING) console.log('push last round number LR = ' + r);
  x.push(r);
}

function VMI_push_number_of_rounds(x, empty) {
  // Pushes the number of rounds (= length of round sequence)
  if(DEBUGGING) console.log('push number of rounds NR = ' + MODEL.rounds);
  x.push(MODEL.rounds);
}

function VMI_push_run_number(x, empty) {
  // Pushes the number of the current run in the selected experiment (or 0)
  const
      sx = EXPERIMENT_MANAGER.selected_experiment,
      nox = (sx ? ` (in ${sx.title})` : ' (no experiment)'),
      xr = (sx ? sx.active_combination_index : 0);
  if(DEBUGGING) console.log('push current run number XR = ' + xr + nox);
  x.push(xr);
}

function VMI_push_number_of_runs(x, empty) {
  // Pushes the number of runs in the current experiment (0 if no experiment)
  const
      sx = EXPERIMENT_MANAGER.selected_experiment,
      nox = (sx ? `(in ${sx.title})` : '(no experiment)'),
      nx = (sx ? sx.combinations.length : 0);
  if(DEBUGGING) console.log('push number of rounds NR =', nx, nox);
  x.push(nx);
}

function VMI_push_random(x, empty) {
  // Pushes a random number from the interval [0, 1)
  const r = Math.random();
  if(DEBUGGING) console.log('push random =', r);
  x.push(r);
}

function VMI_push_pi(x, empty) {
  // Pushes the goniometric constant pi
  if(DEBUGGING) console.log('push pi');
  x.push(Math.PI);
}

function VMI_push_true(x, empty) {
  // pushes the Boolean constant TRUE
  if(DEBUGGING) console.log('push TRUE');
  x.push(1);
}

function VMI_push_false(x, empty) {
  // Pushes the Boolean constant FALSE
  if(DEBUGGING) console.log('push FALSE');
  x.push(0);
}

function VMI_push_infinity(x, empty) {
  // Pushes the constant representing infinity for the solver
  if(DEBUGGING) console.log('push +INF');
  x.push(VM.PLUS_INFINITY);
}

function valueOfIndexVariable(v) {
  // AUXILIARY FUNCTION for the VMI_push_(i, j or k) instructions
  // Returns value of iterator index variable for the current experiment
  if(MODEL.running_experiment) {
    const
        lead = v + '=',
        combi = MODEL.running_experiment.activeCombination;
    for(let i = 0; i < combi.length; i++) {
      const sel = combi[i] ;
      if(sel.startsWith(lead)) return parseInt(sel.substring(2));
    }
  }
  return 0;
}

function VMI_push_i(x, empty) {
  // Pushes the value of iterator index i
  const i = valueOfIndexVariable('i');
  if(DEBUGGING) console.log('push i = ' + i);
  x.push(i);
}

function VMI_push_j(x, empty) {
  // Pushes the value of iterator index j
  const j = valueOfIndexVariable('j');
  if(DEBUGGING) console.log('push j = ' + j);
  x.push(j);
}

function VMI_push_k(x, empty) {
  // Pushes the value of iterator index k
  const k = valueOfIndexVariable('k');
  if(DEBUGGING) console.log('push k = ' + k);
  x.push(k);
}

function pushTimeStepsPerTimeUnit(x, unit) {
  // AUXILIARY FUNCTION for the VMI_push_(time unit) instructions
  // Pushes the number of model time steps represented by 1 unit 
  const t = VM.time_unit_values[unit] / MODEL.time_scale /
      VM.time_unit_values[MODEL.time_unit]; 
  if(DEBUGGING) console.log(`push ${unit} = ${VM.sig4Dig(t)}`);
  x.push(t);
}

function VMI_push_year(x, empty) {
  // Pushes the number of time steps in one year
  pushTimeStepsPerTimeUnit(x, 'year');
}

function VMI_push_week(x, empty) {
  // Pushes the number of time steps in one week
  pushTimeStepsPerTimeUnit(x, 'week');
}

function VMI_push_day(x, empty) {
  // Pushes the number of time steps in one day
  pushTimeStepsPerTimeUnit(x, 'day');
}

function VMI_push_hour(x, empty) {
  // Pushes the number of time steps in one hour
  pushTimeStepsPerTimeUnit(x, 'hour');
}

function VMI_push_minute(x, empty) {
  // Pushes the number of time steps in one minute
  pushTimeStepsPerTimeUnit(x, 'minute');
}

function VMI_push_second(x, empty) {
  // Pushes the number of time steps in one minute
  pushTimeStepsPerTimeUnit(x, 'second');
}

function VMI_push_contextual_number(x, empty) {
  // Pushes the numeric value of the context-sensitive number #
  const n = valueOfNumberSign(x);
  if(DEBUGGING) {
    console.log('push contextual number: # = ' + VM.sig2Dig(n));
  }
  x.push(n);
}

/* VM instruction helper functions */

function valueOfNumberSign(x) {
  // Pushes the numeric value of the # sign for the context of expression `x`
  // NOTE: this can be a wildcard match, an active experiment run selector
  // ending on digits, or tne number context of an entity. The latter typically
  // is the number its name or any of its prefixes ends on, but notes are
  // more "creative" and can return the number context of nearby entities.
  let s = '!NO SELECTOR',
      m = '!NO MATCH',
      n = VM.UNDEFINED;
  // NOTE: Give wildcard selectors precedence over experiment selectors
  // because a wildcard selector is an immediate property of the dataset
  // modifier expression, and hence "closer" to the expression than the
  // experiment selectors that identify the run.
  if(x.wildcard_vector_index !== false) {
    n = x.wildcard_vector_index;
    s = x.attribute;
    m = 'wildcard';
  } else {
    // Check whether `x` is a dataset modifier expression.
    // NOTE: This includes equations.
    if(x.object instanceof Dataset) {
      if(x.attribute) s = x.attribute;
      // Selector may also be defined by a running experiment.
      if(MODEL.running_experiment) {
        const
            ac = MODEL.running_experiment.activeCombination,
            mn = matchingNumberInList(ac, s);
        if(mn !== false) {
          m = 'x-run';
          n = mn;
        }
      }
    }
    // If selector contains no wildcards, get number context (typically
    // inferred from a number in the name of the object)
    if(s.indexOf('*') < 0 && s.indexOf('?') < 0) {
      const d = x.object.numberContext;
      if(d) {
        s = x.object.displayName;
        m = d;
        n = parseInt(d);
      }
    }
  }
  // For datasets, set the parent anchor to be the context-sensitive number
  if(x.object instanceof Dataset) x.object.parent_anchor = n;
  if(DEBUGGING) {
    console.log(`context for # in expression for ${x.variableName}
- expression: ${x.text}
- inferred value of # ${s} => ${m} => ${n}`, x.code);
  }
  return n;
}

function relativeTimeStep(t, anchor, offset, dtm, x) {
  // Returns the relative time step, given t, anchor, offset,
  // delta-t-multiplier and the expression being evaluated (to provide
  // context for anchor #).
  // NOTE: t = 1 corresponds with first time step of simulation period.
  // Anchors are checked for in order of *expected* frequency of occurrence.
  if(anchor === 't') {
    // Offset relative to current time step (most likely to occur).
    return Math.floor(t + offset);
  }
  if(anchor === '#') {
    // Index: offset is added to the inferred value of the # symbol.
    return valueOfNumberSign(x) + offset;
  }
  if(anchor === '^') {
    // Inherited index (for dataset modifier expressions): offset is added
    // to the anchor of the modifier's dataset. 
    if(x.object.array) {
      if(DEBUGGING) {
        console.log('Parent anchor', x.object.parent_anchor);
      }
      // NOTE: For not array-type datasets, ^ is equivalent to #
      return x.object.parent_anchor;
    }
    return valueOfNumberSign(x) + offset;
  }
  if('ijk'.indexOf(anchor) >= 0) {
    // Index: offset is added to the iterator index i, j or k.
    return valueOfIndexVariable(anchor) + offset;
  }
  if(anchor === 'r') {
    // Offset relative to current time step, scaled to time unit of run.
    return Math.floor((t + offset) * dtm);
  }
  if(anchor === 'c') {
    // Relative to start of current optimization block.
    return Math.trunc(t / MODEL.block_length) * MODEL.block_length + offset;
  }
  if(anchor === 'p') {
    // Relative to start of previous optimization block.
    return (Math.trunc(t / MODEL.block_length) - 1) * MODEL.block_length + offset;
  }
  if(anchor === 'n') {
    // Relative to start of next optimization block.
    return (Math.trunc(t / MODEL.block_length) + 1) * MODEL.block_length + offset;
  }
  if(anchor === 'l') {
    // Last: offset relative to the last index in the vector.
    return MODEL.end_period - MODEL.start_period + 1 + offset;
  }
  if(anchor === 's') {
    // Scaled: offset is scaled to time unit of run.
    return Math.floor(offset * dtm);
  }
  // Fall-through: offset relative to the initial value index (0).
  // NOTE: this also applies to anchor f (First).
  return offset;
}

function twoOffsetTimeStep(t, a1, o1, a2, o2, dtm, x) {
  // Returns the list [rt, ao1, ao2] where rt is the time step, and ao1 and ao2
  // are anchor-offset shorthand for the debugging message, given t, two anchors
  // and offsets, and the delta-t-multiplier
  // NOTE: `dtm` will differ from 1 only for experiment results
  // NOTE: expression `x` is passed to provide context for evaluation of #
  let t1 = relativeTimeStep(t, a1, o1, dtm, x),
      ao1 = [' @ ', a1, (o1 > 0 ? '+' : ''), (o1 ? o1 : ''),
          ' = ', t1].join(''),
      ao2 = '';
  if(o2 !== o1 || a2 !== a1) {
    // Two different offsets => use the midpoint as time (NO aggregation!)
    const t2 = relativeTimeStep(t, a2, o2, dtm, x);
    ao2 = [' : ', a2, (o2 > 0 ? '+' : ''), (o2 ? o2 : ''), ' = ', t2].join('');
    t1 = Math.floor((t1 + t2) / 2);
    ao2 += ' => midpoint = ' + t1;
  }
  return [t1, ao1, ao2];
}

/* VM instructions (continued) */

function VMI_push_var(x, args) {
  // Pushes the value of the variable specified by `args`, being the list
  // [obj, anchor1, offset1, anchor2, offset2] where `obj` can be a vector
  // or an expression, or a cluster unit balance specifier 
  const
      obj = args[0],
      // NOTE: use the "local" time step for expression x
      tot = twoOffsetTimeStep(x.step[x.step.length - 1],
          args[1], args[2], args[3], args[4], 1, x);
  let t = tot[0];
  // Negative time step is evaluated as t = 0 (initial value), while t beyond
  // optimization period is evaluated as its last time step UNLESS t is
  // used in a self-referencing variable
  const xv = obj.hasOwnProperty('xv');
  if(!xv) {
    t = Math.max(0, Math.min(
        MODEL.end_period - MODEL.start_period + MODEL.look_ahead + 1, t));
  }
  // Trace only now that time step t has been computed
  if(DEBUGGING) {
    console.log('push var:', (xv ? '[SELF]' :
        (obj instanceof Expression ? obj.text : '[' + obj.toString() + ']')),
        tot[1] + ' ' + tot[2]);
  }
  if(Array.isArray(obj)) {
    // Object is a vector
    let v = t < obj.length ? obj[t] : VM.UNDEFINED;
    // NOTE: when the vector is the "active" parameter for sensitivity
    // analysis, the value is multiplied by 1 + delta %
    if(obj === MODEL.active_sensitivity_parameter) {
      // NOTE: do NOT scale exceptional values
      if(v > VM.MINUS_INFINITY && v < VM.PLUS_INFINITY) {
        v *= (1 + MODEL.sensitivity_delta * 0.01);
      }
    }
    x.push(v);
  } else if(xv) {
    // Variable references an earlier value computed for this expression `x`
    x.push(t >= 0 && t < x.vector.length ? x.vector[t] : obj.dv);
  } else if(obj.hasOwnProperty('c') && obj.hasOwnProperty('u')) {
    // Object holds link lists for cluster balance computation
    x.push(MODEL.flowBalance(obj, t));
  } else if(obj instanceof Expression) {
    x.push(obj.result(t));
  } else if(typeof obj === 'number') {
    // Object is a number
    x.push(obj);
  } else {
    console.log('ERROR: VMI_push_var object =', obj);
    x.push(VM.UNKNOWN_ERROR);
  }
}

function VMI_push_entity(x, args) {
  // Pushes a special "entity reference" object based on `args`, being the
  // list [obj, anchor1, offset1, anchor2, offset2] where `obj` has the
  // format {r: entity object, a: attribute}
  // The object that is pushed on the stack passes the entity, the attribute
  // to use, and the time interval
  const
      // NOTE: use the "local" time step for expression x
      tot = twoOffsetTimeStep(x.step[x.step.length - 1],
          args[1], args[2], args[3], args[4], 1, x),
      er = {entity: args[0].r, attribute: args[0].a, t1: tot[0], t2: tot[1]};
  // Trace only now that time step t has been computed
  if(DEBUGGING) {
    console.log(['push entity: ', er.entity.displayName, '|', er.attribute,
        ', t = ', er.t1, ' - ', er.t2].join(''));
  }
  x.push(er);
}

function VMI_push_wildcard_entity(x, args) {
  // Pushes the value of (or reference to) an entity attribute, based on
  // `args`, being the list [obj, anchor1, offset1, anchor2, offset2]
  // where `obj` has the format {ee: list of eligible entities,
  // n: name (with wildcard #), a: attribute, br: by reference (boolean)}
  // First select the first entity in `ee` that matches the wildcard vector
  // index of the expression `x` being executed.
  const el = args[0].ee;
  let nn = args[0].n.replace('#', x.wildcard_vector_index),
      obj = null;
  for(let i = 0; !obj && i < el.length; i++) {
    if(el[i].name === nn) obj = el[i];
  }
  // If no match, then this indicates a bad reference.
  if(!obj) {
    console.log(`ERROR: no match for "${nn}" in eligible entity list`, el);
    x.push(VM.BAD_REF);
    return;
  }
  // Otherwise, if args[0] indicates "by reference", then VMI_push_entity
  // can be called with the appropriate parameters.
  const attr = args[0].a || obj.defaultAttribute;
  if(args[0].br) {
    VMI_push_entity(x, {r: obj, a: attr});
    return;
  }
  // Otherwise, if the entity is a dataset modifier, this must be an
  // equation (identified by its name, not by a modifier selector) so
  // push the result of this equation using the wildcard vector index
  // of the expression that is being computed.
  if(obj instanceof DatasetModifier) {
    VMI_push_dataset_modifier(x,
        [{d: obj.dataset, s: x.wildcard_vector_index, x: obj.expression},
            args[1], args[2], args[3], args[4]]);
    return;
  }
  // Otherwise, it can be a vector type attribute or an expression.
  let v = obj.attributeValue(attr);
  if(v === null) v = obj.attributeExpression(attr);
  // If no match, then this indicates a bad reference.
  if(v === null) {
    console.log(`ERROR: bad variable "${obj.displayName}" with attribute "${attr}"`);
    x.push(VM.BAD_REF);
    return;
  }
  // Otherwise, VMI_push_var can be called with `v` as first argument.
  VMI_push_var(x, [v, args[1], args[2], args[3], args[4]]);
}

function VMI_push_dataset_modifier(x, args) {
  // NOTE: the first argument specifies the dataset `d` and (optionally!)
  // the modifier selector `s`, and expression `x`.
  // If `s` is a number, then the result of `x` must be computed with
  // this number als wildcard number.
  // If `s` is not specified, the modifier to be used must be inferred from
  // the running experiment UNLESS the field `ud` ("use data") is defined
  // for the first argument, and evaluates as TRUE.
  // NOTE: Ensure that number 0 is not interpreted as FALSE.
  let wcnr = (args[0].s === undefined ? false : args[0].s);
  const
      ds = args[0].d,
      ud = args[0].ud || false,
      mx = args[0].x || null,
      // NOTE: Use the "local" time step for expression x, i.e., the top
      // value of the expression's time step stack `x.step`.
      tot = twoOffsetTimeStep(x.step[x.step.length - 1],
          args[1], args[2], args[3], args[4], 1, x),
      // Record whether either anchor uses the context-sensitive number.
      hashtag_index = (args[1] === '#' || args[3] === '#');
  // NOTE: Sanity check to facilitate debugging; if no dataset is provided,
  // the script will still break at the LET statement below.
  if(!ds) console.log('ERROR: VMI_push_dataset_modifier without dataset',
      x.variableName, x.code);
  let t = tot[0],
      // By default, use the vector of the dataset to compute the value.
      obj = ds.vector;
  if(ds.array) {
    // For array-type datasets, do NOT adjust "index" t to model run period.
    // NOTE: Indices start at 1, but arrays are zero-based, so subtract 1.
    t--;
    // When data is periodic, adjust `t` to fall within the vector length.
    if(ds.periodic && obj.length > 0) {
      t = t % obj.length;
      if(t < 0) t += obj.length;
    }
    if(hashtag_index) {
      // NOTE: Add 1 because (parent) anchors are 1-based.
      ds.parent_anchor = t + 1;
      if(DEBUGGING) {
        console.log('ANCHOR for:', ds.displayName, '=', ds.parent_anchor);
      }
    }
  } else {
    // Negative time step is evaluated as t = 0 (initial value), t beyond
    // optimization period is evaluated as its last time step.
    // NOTE: By default, use the dataset vector value for `t`.
    t = Math.max(0, Math.min(
        MODEL.end_period - MODEL.start_period + MODEL.look_ahead + 1, t));
  }
  if(wcnr !== false || ds === MODEL.equations_dataset) {
    // If a wildcard number is specified, or when a normal (not-wildcard)
    // equation is referenced, use the modifier expression to calculate
    // the value to push.
    obj = mx;
    // If '?' is passed as wildcard number, use the wildcard vector index
    // of the expression that is being computed (this may be FALSE).
    if(wcnr === '?') {
      wcnr = x.wildcard_vector_index;
    }
  } else if(!ud) {
    // In no selector and not "use data", check whether a running experiment
    // defines the expression to use. If not, `obj` will be the dataset
    // vector (so same as when "use data" is set).
    obj = ds.activeModifierExpression;
    if(wcnr === false && MODEL.running_experiment) {
      // If experiment run defines the modifier selector, the active
      // combination may provide a context for #.
      const sel = (obj instanceof Expression ? obj.attribute : x.attribute);
      wcnr = matchingNumberInList(
          MODEL.running_experiment.activeCombination, sel);
    }
  }
  if(!obj) {
    console.log('ANOMALY: no object. obj, wcnr, args, x', obj, wcnr, args, x);
  }
  // Now determine what value `v` should be pushed onto the expression stack.
  // By default, use the dataset default value.
  let v = ds.defaultValue,
      // NOTE: `obstr` is used only when debugging, to log `obj` in human-
      // readable format.
      obstr = (obj instanceof Expression ? obj.text : `[${obj.toString()}]`);
  if(Array.isArray(obj)) {
    // `obj` is a vector.
    if(t >= 0 && t < obj.length) {
      v = obj[t];
    } else if(ds.array && t >= obj.length) {
      // Ensure that value of t is human-readable.
      // NOTE: Add 1 to compensate for earlier t-- to make `t` zero-based.
      const index = VM.sig2Dig(t + 1);
      // Special case: index is undefined because # was undefined.
      if(hashtag_index && index === '\u2047') {
        // In such cases, return the default value of the dataset.
        v = ds.default_value;
      } else {
        // Set error value to indicate that array index is out of bounds.
        v = VM.ARRAY_INDEX;
        VM.out_of_bounds_array = ds.displayName;
        VM.out_of_bounds_msg = `Index ${index} not in array dataset ` +
            `${ds.displayName}, which has length ${obj.length}`;
      }
    }
    // Fall through: no change to `v` => dataset default value is pushed.
  } else {
    // `obj` is an expression.
    // NOTE: Readjust `t` when `obj` is an expression for an *array-type*
    // dataset modifier.
    if(obj.object instanceof Dataset && obj.object.array) {
      t++;
    }
    v = obj.result(t, wcnr);
  }
  // Trace only now that time step t has been computed.
  if(DEBUGGING) {
    console.log('push dataset modifier:', obstr,
        tot[1] + (tot[2] ? ':' + tot[2] : ''), 'value =', VM.sig4Dig(v),
        '\nExpression: ', x.text, '\nVariable:', x.variableName, 
        'Context number:', wcnr);
  }
  // NOTE: If value is exceptional ("undefined", etc.), use default value.
  // DEPRECATED !! if(v >= VM.PLUS_INFINITY) v = ds.defaultValue;
  // Finally, push the value onto the expression stack
  x.push(v);
}


function VMI_push_run_result(x, args) {
  // NOTE: the first argument specifies the experiment run results:
  // x: experiment object (FALSE indicates: use current experiment)
  // r: integer number, or selector list
  // v: variable index (integer number), or identifier (string)
  // s: statistic (empty string indicates: return value at time t)
  // m: time scaling method (empty indicates: us "nearest t" method)
  // p: is TRUE when time series is periodic
  // d: if specified, use this default value instead of "undefined"
  // t: if integer t > 0, use floor(current time step / t) as run number
  const
      rrspec = args[0],
      // NOTE: when expression `x` for which this instruction is executed is
      // a dataset modifier, use the time scale of the dataset, not of the
      // model, because the dataset vector is scaled to the model time scale
      model_dt = MODEL.timeStepDuration;
  // NOTE: run result now defaults to UNDEFINED, because the VM handles errors
  // better now (no call stack dump on "undefined" etc., but only on errors)
  let v = rrspec.dv || VM.UNDEFINED;
  if(rrspec && rrspec.hasOwnProperty('x')) {
    let xp = rrspec.x,
        rn = rrspec.r,
        rri = rrspec.v;
    if(xp === false) xp = MODEL.running_experiment;
    if(xp instanceof Experiment) {
      if(Array.isArray(rn)) {
        rn = xp.matchingCombinationIndex(rn); 
      } else if(rn < 0) {
        // Relative run number: use current run # + r (first run has number 0)
        rn += xp.active_combination_index;
      } else if(rrspec.nr !== false) {
        // Run number inferred from local time step of expression
        const
            rl = MODEL.end_period - MODEL.start_period + 1,
            range = rangeToList(rrspec.nr, xp.runs.length - 1);
        if(range) {
          const
              l = range.length,
              ri = Math.floor(x.step[x.step.length - 1] * l / rl);
          rn = (ri < l ? range[ri] : range[l - 1]);
        }
      }
      // If variable is passed as identifier, get its index for the experiment
      if(typeof rri === 'string') rri = xp.resultIndex(rri);
      // Then proceed only if run number and result index both make sense
      const run_count = (xp.completed ? xp.runs.length :
          xp.active_combination_index);
      if(rn !== false && rn >= 0 && rn < run_count) {
        const r = xp.runs[rn];
        if(rri in r.results) {
          const
              rr = r.results[rri],
              tsd = r.time_step_duration,
              // Get the delta-t multiplier: divide model time step duration
              // by time step duration of the experiment run if they differ 
              dtm = (Math.abs(tsd - model_dt) < VM.NEAR_ZERO ? 1 : model_dt / tsd);
          let stat = rrspec.s;
          // For outcome datasets without specific statistic, default to LAST
          if(!(stat || rr.x_variable)) stat = 'LAST';
          // For a valid experiment variable, the default value is 0
          v = 0;
          if(stat) {
            if(stat === 'LAST') {
              v = rr.last;
            } else if(stat === 'SUM') {
              v = rr.sum;
            } else if(stat === 'MEAN') {
              v = rr.mean;
            } else if(stat === 'VAR') {
              v = rr.variance;
            } else if(stat === 'SD') {
              v = Math.sqrt(rr.variance);
            } else if(stat === 'MIN') {
              v = rr.minimum;
            } else if(stat === 'MAX') {
              v = rr.maximum;
            } else if(stat === 'NZ') {
              v = rr.non_zero_tally;
            }
            if(DEBUGGING) {
              const trc = ['push run result: ', xp.title,
                ', run #', rn,
                ', variable ', rr.displayName,
                ', ', stat, ' = ', VM.sig4Dig(v)];
              console.log(trc.join(''));
            }
          } else {
            // No statistic => return the vector for local time step
            // using here, too, the delta-time-modifier to adjust the offsets
            // for different time steps per experiment
            const tot = twoOffsetTimeStep(x.step[x.step.length - 1],
                args[1], args[2], args[3], args[4], dtm, x);
            // Scale the (midpoint) time step (at current model run time scale)
            // to the experiment run time scale and get the run result value
            v = rr.valueAtModelTime(tot[0], model_dt, rrspec.m, rrspec.p);
            if(DEBUGGING) {
              const trc = ['push run result: ', xp.title,
                  ', run #', rn,
                  ', variable ', rr.displayName, tot[1], tot[2],
                  ', value = ', VM.sig4Dig(v)];
              console.log(trc.join(''));
            }
          }
        }
      }
    }
  }
  x.push(v);
}

function VMI_push_statistic(x, args) {
  // Pushes the value of the statistic over the list of variables specified by
  // `args`, being the list [stat, list, anchor, offset] where `stat` can be one
  // of MAX, MEAN, MIN, N, SD, SUM, and VAR, and `list` is a list of vectors
  // NOTE: each statistic may also be "suffixed" by NZ to denote that only
  // non-zero numbers should be considered
  let stat = args[0],
      list = args[1];
  if(!list) {
    // Special case: null or empty list => push zero
    if(DEBUGGING) {
      console.log('push statistic: 0 (no variable list)');
    }
    x.push(0);
    return;
  }
  const
      anchor1 = args[2],
      offset1 = args[3],
      anchor2 = args[4],
      offset2 = args[5],
      wdict = args[6] || false;
  // If defined, the wildcard dictionary provides subsets of `list`
  // to be used when the wildcard number of the expression is set.
  if(wdict && x.wildcard_vector_index !== false) {
    list = wdict[x.wildcard_vector_index] || [];
  }
  // If no list specified, the result is undefined
  if(!Array.isArray(list) || list.length === 0) {
    x.push(VM.UNDEFINED);
    return;          
  }
  // Get the "local" time step range for expression x
  let t = x.step[x.step.length - 1],
      t1 = relativeTimeStep(t, anchor1, offset1, 1, x),
      t2 = t1,
      ao1 = [' @ ', anchor1, offset1 > 0 ? '+' : '', offset1 ? offset1 : '',
          ' = ', t1].join(''),
      ao2 = '';
  if(anchor2 !== anchor1 || offset2 !== offset1) {
    t = relativeTimeStep(t, anchor2, offset2, 1, x);
    ao2 = [' : ', anchor2, offset2 > 0 ? '+' : '', offset2 ? offset2 : '',
        ' = ', t].join('');
    if(t < t1) {
      t2 = t1;
      t1 = t;
    } else {
      t2 = t;
    }
  }
  // Negative time step is evaluated as t = 0 (initial value) t beyond
  // optimization period is evaluated as its last time step
  const tmax = MODEL.end_period - MODEL.start_period + 1;
  t1 = Math.max(0, Math.min(tmax, t1));
  t2 = Math.max(0, Math.min(tmax, t2));
  // Trace only now that time step range has been computed
  if(DEBUGGING) {
    const trc = ['push statistic: [', stat, ': N = ', list.length, ']', ao1, ao2];
    console.log(trc.join(''));
  }
  // Establish whether statistic pertains to non-zero values only
  const nz = stat.endsWith('NZ');
  // If so, trim the 'NZ'
  if(nz) stat = stat.slice(0, -2);
  // Now t1 ... t2 is the range of time steps to iterate over for each variable
  let obj,
      vlist = [];
  for(let t = t1; t <= t2; t++) {
    // Get the list of values
    // NOTE: variables may be vectors or expressions
    for(let i = 0; i < list.length; i++) {
      obj = list[i];
      if(Array.isArray(obj)) {
        // Object is a vector
        if(t < obj.length) {
          v = obj[t];
        } else {
          v = VM.UNDEFINED;
        }
      } else {
        // Object is an expression
        v = obj.result(t);
      }
      // Push value unless it is zero and NZ is TRUE, or if it is undefined
      // (this will occur when a variable has been deleted)
      if(v <= VM.PLUS_INFINITY && (!nz || Math.abs(v) > VM.NEAR_ZERO)) {
        vlist.push(v);
      }
    }
  }
  const
      n = vlist.length,
      // NOTE: count is the number of values used in the statistic 
      count = (nz ? n : list.length);
  if(stat === 'N') {
    x.push(count);
    return;
  }
  // If no non-zero values remain, all statistics are zero (as ALL values were zero)
  if(n === 0) {
    x.push(0);
    return;          
  }
  // Check which statistic, starting with the most likely to be used
  if(stat === 'MIN') {
    x.push(Math.min(...vlist));
    return;
  }
  if(stat === 'MAX') {
    x.push(Math.max(...vlist));
    return;
  }
  // For all remaining statistics, the sum must be calculated
  let sum = 0;
  for(let i = 0; i < n; i++) {
    sum += vlist[i];
  }
  if(stat === 'SUM') {
    x.push(sum);
    return;
  }
  // Now statistic must be either MEAN, SD or VAR, so start with the mean
  // NOTE: no more need to check for division by zero
  const mean = sum / count;
  if(stat === 'MEAN') {
    x.push(mean);
    return;
  }
  // Now calculate the variance
  let sumsq = 0;
  for(let i = 0; i < n; i++) {
    sumsq += Math.pow(vlist[i] - mean, 2);
  }
  if(stat === 'VAR') {
    x.push(sumsq / count);
    return;
  }
  if(stat === 'SD') {
    x.push(Math.sqrt(sumsq / count));
    return;
  }
  // Fall-through: unknown statistic
  x.push(VM.UNDEFINED);
}

function VMI_replace_undefined(x, empty) {
  // Replaces one of the two top numbers on the stack by the other if the one
  // is undefined
  const d = x.pop(true); // TRUE denotes that "undefined" should be ignored as issue
  if(d !== false) {
    if(DEBUGGING) console.log('REPLACE UNDEFINED (' + d.join(', ') + ')');
    x.retop(d[0] === VM.UNDEFINED ? d[1] : d[0]);
  }
}

// NOTE: when the VM computes logical OR, AND and NOT, any non-zero number
// is interpreted as TRUE

function VMI_or(x, empty) {
  // Performs a logical OR on the two top numbers on the stack
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('OR (' + d.join(', ') + ')');
    x.retop(d[0] !== 0 || d[1] !== 0 ? 1 : 0);
  }
}

function VMI_and(x, empty) {
  // Performs a logical AND on the two top numbers on the stack
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('AND (' + d.join(', ') + ')');
    x.retop(d[0] === 0 || d[1] === 0 ? 0 : 1);
  }
}

function VMI_not(x, empty) {
  // Performs a logical NOT on the top number of the stack
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('NOT ' + d);
    x.retop(d === 0 ? 1 : 0);
  }
}

function VMI_abs(x, empty) {
  // Replaces the top number of the stack by its absolute value
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('ABS ' + d);
    x.retop(Math.abs(d));
  }
}

function VMI_eq(x, empty) {
  // Tests equality of the two top numbers on the stack
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('EQ (' + d.join(', ') + ')');
    x.retop(d[0] === d[1] ? 1 : 0);
  }
}

function VMI_ne(x, empty) {
  // Tests inequality of the two top numbers on the stack
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('NE (' + d.join(', ') + ')');
    x.retop(d[0] !== d[1] ? 1 : 0);
  }
}

function VMI_lt(x, empty) {
  // Tests whether second number on the stack is less than the top number
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('LT (' + d.join(', ') + ')');
    x.retop(d[0] < d[1] ? 1 : 0);
  }
}

function VMI_gt(x, empty) {
  // Tests whether second number on the stack is greater than the top number
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('GT (' + d.join(', ') + ')');
    x.retop(d[0] > d[1] ? 1 : 0);
  }
}

function VMI_le(x, empty) {
  // Tests whether second number on the stack is less than, or equal to,
  // the top number
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('LE (' + d.join(', ') + ')');
    x.retop(d[0] <= d[1] ? 1 : 0);
  }
}

function VMI_ge(x, empty) {
  // Tests whether second number on the stack is greater than, or equal to,
  // the top number
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('LE (' + d.join(', ') + ')');
    x.retop(d[0] >= d[1] ? 1 : 0);
  }
}

function VMI_add(x, empty) {
  // Pops the top number on the stack and adds it to the new top number
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('ADD (' + d.join(', ') + ')');
    x.retop(d[0] + d[1]);
  }
}

function VMI_sub(x, empty) {
  // Pops the top number on the stack and subtracts it from the new
  // top number
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('SUB (' + d.join(', ') + ')');
    x.retop(d[0] - d[1]);
  }
}

function VMI_mul(x, empty) {
  // Pops the top number on the stack and multiplies it with the new
  // top number
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('MUL (' + d.join(', ') + ')');
    x.retop(d[0] * d[1]);
  }
}

function VMI_div(x, empty) {
  // Pops the top number on the stack and divides the new top number
  // by it. In case of division by zero, the top is replaced by #DIV0!
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('DIV (' + d.join(', ') + ')');
    if(Math.abs(d[1]) <= VM.NEAR_ZERO) {
      x.retop(VM.DIV_ZERO);
    } else {
      x.retop(d[0] / d[1]);
    }
  }
}

function VMI_mod(x, empty) {
  // Pops the top number on the stack, divides the new top number by it
  // (if non-zero, or it pushes error code #DIV0!), takes the fraction
  // part, and multiplies this with the divider; in other words, it
  // performs a "floating point MOD operation"
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('DIV (' + d.join(', ') + ')');
    if(Math.abs(d[1]) <= VM.NEAR_ZERO) {
      x.retop(VM.DIV_ZERO);
    } else {
      x.retop(d[0] % d[1]);  // % is the modulo operator in JavaScript
    }
  }
}

function VMI_negate(x, empty) {
  // Performs a negation on the top number of the stack
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('NEG ' + d);
    x.retop(-d);
  }
}

function VMI_power(x, empty) {
  // Pops the top number on the stack and raises the new top number
  // to its power
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('POWER (' + d.join(', ') + ')');
    x.retop(Math.pow(d[0], d[1]));
  }
}

function VMI_sqrt(x, empty) {
  // Replaces the top number of the stack by its square root, or by
  // error code #VALUE! if the top number is negative
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('SQRT ' + d);
    if(d < 0) {
      x.retop(VM.BAD_CALC);
    } else {
      x.retop(Math.sqrt(d));
    }
  }
}

function VMI_sin(x, empty) {
  // Replaces the top number X of the stack by sin(X)
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('SIN ' + d);
    x.retop(Math.sin(d));
  }
}

function VMI_cos(x, empty) {
  // Replaces the top number X of the stack by cos(X)
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('COS ' + d);
    x.retop(Math.cos(d));
  }
}

function VMI_atan(x, empty) {
  // Replaces the top number X of the stack by atan(X)
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('ATAN ' + d);
    x.retop(Math.atan(d));
  }
}

function VMI_ln(x, empty) {
  // Replaces the top number X of the stack by ln(X), or by error
  // code #VALUE! if X is negative
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('LN ' + d);
    if(d < 0) {
      x.retop(VM.BAD_CALC);
    } else {
      x.retop(Math.log(d));
    }
  }
}

function VMI_exp(x, empty) {
  // Replaces the top number X of the stack by exp(X)
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('EXP ' + d);
    x.retop(Math.exp(d));
  }
}

function VMI_log(x, empty) {
  // Pops the top number B from the stack and replaces the new top
  // number A by A log B. NOTE: x = A log B  <=>  x = ln(B) / ln(A)
  let d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('LOG (' + d.join(', ') + ')');
    try {
      d = Math.exp(Math.log(d[1]) / Math.log(d[0]));
    } catch(err) {
      d = VM.BAD_CALC;
    }
    x.retop(d);
  }
}

function VMI_round(x, empty) {
  // Replaces the top number X of the stack by round(X)
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('ROUND ' + d);
    x.retop(Math.round(d));
  }
}

function VMI_int(x, empty) {
  // Replaces the top number X of the stack by its integer part
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('INT ' + d);
    x.retop(Math.trunc(d));
  }
}

function VMI_fract(x, empty) {
  // Replaces the top number X of the stack by its fraction part
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('FRACT ' + d);
    x.retop(d - Math.trunc(d));
  }
}

function VMI_exponential(x, empty) {
  // Replaces the top number X of the stack by a random number from the
  // negative exponential distribution with parameter X (so X is the lambda,
  // and the mean will be 1/X)
  const d = x.top();
  if(d !== false) {
    const a = randomExponential(d);
    if(DEBUGGING) console.log(`EXPONENTIAL ${d} = ${a}`);
    x.retop(a);
  }
}

function VMI_poisson(x, empty) {
  // Replaces the top number X of the stack by a random number from the
  // poisson distribution with parameter X (so X is the mean value lambda)
  const d = x.top();
  if(d !== false) {
    const a = randomPoisson(d);
    if(DEBUGGING) console.log('POISSON ' + d + ' = ' + a);
    x.retop(a);
  }
}

function VMI_binomial(x, empty) {
  // Replaces the top list (!) A of the stack by Bin(A[0], A[1]), i.e., a random
  // number from the binomial distribution with n = A[0] and p = A[1]
  const d = x.top();
  if(d !== false) {
    if(d instanceof Array && d.length === 2) {
      a = randomBinomial(...d);
      if(DEBUGGING) console.log('BINOMIAL (' + d.join(', ') + ') = ' + a);
      x.retop(a);
    } else {
      if(DEBUGGING) console.log('BINOMIAL: invalid parameter(s) ' + d);
      x.retop(VM.PARAMS);
    }
  }
}

function VMI_normal(x, empty) {
  // Replaces the top list (!) A of the stack by N(A[0], A[1]), i.e., a random
  // number from the normal distribution with mu = A[0] and sigma = A[1]
  const d = x.top();
  if(d !== false) {
    if(d instanceof Array && d.length === 2) {
      a = randomNormal(...d);
      if(DEBUGGING) console.log('NORMAL (' + d.join(', ') + ') = ' + a);
      x.retop(a);
    } else {
      if(DEBUGGING) console.log('NORMAL: invalid parameter(s) ' + d);
      x.retop(VM.PARAMS);
    }
  }
}

function VMI_weibull(x, empty) {
  // Replaces the top list (!) A of the stack by Weibull(A[0], A[1]), i.e., a
  // random number from the Weibull distribution with lambda = A[0] and k = A[1]
  const d = x.top();
  if(d !== false) {
    if(d instanceof Array && d.length === 2) {
      const a = randomWeibull(...d);
      if(DEBUGGING) console.log('WEIBULL (' + d.join(', ') + ') = ' + a);
      x.retop(a);
    } else {
      if(DEBUGGING) console.log('WEIBULL: invalid parameter(s) ' + d);
      x.retop(VM.PARAMS);
    }
  }
}

function VMI_triangular(x, empty) {
  // Replaces the top list (!) A of the stack by Tri(A[0], A[1]), A[2]), i.e.,
  // a random number from the triangular distribution with a = A[0], b = A[1],
  // and c = A[2]. NOTE: if only 2 parameters are passed, c is assumed to equal
  // (a + b) / 2 
  const d = x.top();
  if(d !== false) {
    if(d instanceof Array && (d.length === 2 || d.length === 3)) {
      const a = randomTriangular(...d);
      if(DEBUGGING) console.log('TRIANGULAR (' + d.join(', ') + ') = ' + a);
      x.retop(a);
    } else {
      if(DEBUGGING) console.log('TRIANGULAR: invalid parameter(s) ' + d);
      x.retop(VM.PARAMS);
    }
  }
}

function VMI_npv(x, empty) {
  // Replaces the top list (!) A of the stack by the net present value (NPV)
  // of the arguments in A. A[0] is the interest rate r, A[1] is the number of
  // time periods n. If A has only 1 or 2 elements, the NPV is 0. If A has 3
  // elements, A[2] is the constant cash flow C, and the NPV is the sum
  // (for t = 0 to n-1) of C/(1+r)^t. If A has N>2 elements, A[2] through A[N]  
  // are considered as a cash flow time series C0, C1, ..., CN-2 that is then
  // NOTE: if A is not a list, A considered to be the single argument, and is
  // hence replaced by 0
  const d = x.top();
  if(d !== false) {
    if(d instanceof Array && d.length > 2) {
      if(DEBUGGING) console.log('NPV (' + d.join(', ') + ')');
      let npv,
          df = 1;
      const discounting_factor = 1/(1 + d[0]);
      if(d.length === 3) {
        const n = d[1],
              c = d[2];
        npv = c;
        for(let i = 1; i < n; i++) {
          df *= discounting_factor;
          npv += c * df;
        }
      } else {
        npv = d[1];
        const n = d.length;
        for(let i = 2; i < n; i++) {
          df *= discounting_factor;
          npv += d[i] * df;
        }        
      }
      x.retop(npv);
    } else {
      if(DEBUGGING) console.log('NPV = 0 (fewer than 3 parameters)');
      x.retop(0);
    }
  }  
}

function VMI_min(x, empty) {
  // Replaces the top list (!) A of the stack by the lowest value in this list
  // NOTE: if A is not a list, A is left on the stack
  const d = x.top();
  if(d !== false && d instanceof Array) {
    if(DEBUGGING) console.log('MIN (' + d.join(', ') + ')');
    x.retop(Math.min(...d));
  } else if(DEBUGGING) {
    console.log('MIN (' + d + ')');
  }
}

function VMI_max(x, empty) {
  // Replaces the top list (!) A of the stack by the highest value in this list
  // NOTE: if A is not a list, A is left on the stack
  const d = x.top();
  if(d !== false && d instanceof Array) {
    if(DEBUGGING) console.log('MAX (' + d.join(', ') + ')');
    x.retop(Math.max(...d));
  } else if(DEBUGGING) {
    console.log('MAX (' + d + ')');
  }
}

function VMI_concat(x, empty) {
  // Pops the top number B from the stack, and then replaces the new top
  // element A by [A, B] if A is a number, or adds B to A is A is a list
  // of numbers (!) or
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('CONCAT (' + d.join(', ') + ')');
    const a = d[0], b = d[1];
    if(a instanceof Array) {
      if(b instanceof Array) {
        x.retop(a.concat(b));
      } else {
        a.push(b);
        x.retop(a);
      }
    } else {
      x.retop([a, b]);
    }
  }
}

function VMI_jump(x, index) {
  // Sets the program counter of the VM to `index` minus 1, as the
  // counter is ALWAYS increased by 1 after calling a VMI function
  if(DEBUGGING) console.log('JUMP ' + index);
  x.program_counter = index - 1;
}

function VMI_jump_if_false(x, index) {
  // Tests the top number A of the stack, and if A is FALSE (zero or
  // VM.UNDEFINED) sets the program counter of the VM to `index` minus 1,
  // as the counter is ALWAYS increased by 1 after calling a VMI function
  const r = x.top(true);
  if(DEBUGGING) console.log(`JUMP-IF-FALSE (${r}, ${index})`);
  if(r === 0 || r === VM.UNDEFINED || r === false) {
    // Only jump on FALSE, leaving the stack "as is", so that in case
    // of no THEN the expression result equals the IF condition value
    // NOTE: Also do this on a stack error (r === false)
    x.program_counter = index - 1;
  } else {
    // Remove the value from the stack
    x.stack.pop();
  }
}

function VMI_pop_false(x, empty) {
  // Removes the top value from the stack, which should be 0 or
  // VM.UNDEFINED (but this is not checked)
  const r = x.stack.pop();
  if(DEBUGGING) console.log(`POP-FALSE (${r})`);
}

function VMI_if_then(x, empty) {
  // NO operation -- as of version 1.0.14, this function only serves as
  // operator symbol, and its executions would indicate an error
  console.log('WARNING: this IF-THEN instruction is obsolete!');
}

function VMI_if_else(x, empty) {
  // NO operation -- as of version 1.0.14, this function only serves as
  // operator symbol, and its executions would indicate an error
  console.log('WARNING: this IF-THEN instruction is obsolete!');
}

//
// Functions that implement random numbers from specific distribution
//

function randomExponential(lambda) {
  // Returns a random number drawn from a Exp(lambda) distribution
  return -Math.log(Math.random()) / lambda;
}

function randomWeibull(lambda, k) {
  // Returns a random number drawn from a Weibull(lambda, k) distribution
  if(Math.abs(k) < VM.NEAR_ZERO) return VM.DIV_ZERO;
  return lambda * Math.pow(-Math.log(Math.random()), 1.0 / k);
}

function randomTriangular(a, b, c=0.5*(a + b)) {
  // Returns a random number drawn from a Triangular(a, b, c) distribution
  const u = Math.random(), b_a = b - a, c_a = c - a;
  if(u < c_a / b_a) {
    return a + Math.sqrt(u * b_a * c_a);
  } else {
    return b - Math.sqrt((1 - u) * b_a * (b - c)); 
  }
}

function randomNormal(mean, std) {
  // Returns a random number drawn from a N(mean, standard deviation)
  // distribution
  const
    a1 = -39.6968302866538, a2 = 220.946098424521, a3 = -275.928510446969,
    a4 = 138.357751867269, a5 = -30.6647980661472, a6 = 2.50662827745924,
    b1 = -54.4760987982241, b2 = 161.585836858041, b3 = -155.698979859887,
    b4 = 66.8013118877197, b5 = -13.2806815528857,
    c1 = -7.78489400243029E-03, c2 = -0.322396458041136,
    c3 = -2.40075827716184, c4 = -2.54973253934373, c5 = 4.37466414146497,
    c6 = 2.93816398269878,
    d1 = 7.78469570904146E-03, d2 = 0.32246712907004, d3 = 2.445134137143,
    d4 = 3.75440866190742,
    p = Math.random(), p_low = 0.02425, p_high = 1 - p_low;
  let q, r, zn = 0, zd = 1;
  if(p >= p_low && p <= p_high) {
    q = p - 0.5;
    r = q * q;
    zn = (((((a1*r + a2)*r + a3)*r + a4)*r + a5)*r + a6)*q;
    zd = ((((b1*r + b2)*r + b3)*r + b4)*r + b5)*r + 1;
  } else {
    q = Math.sqrt(-2 * Math.log(p < p_low ? p : 1 - p));
    zn = ((((c1*q + c2)*q + c3)*q + c4)*q + c5)*q + c6;
    zd = (((d1*q + d2)*q + d3)*q + d4)* q + 1;
    if(p > p_high) zn = -zn;
  }
  return mean + std * zn / zd;
}

function randomBinomial(n, p) {
  const pp = (p > 0.5 ? 1.0 - p : p),
        log_q = Math.log(1.0 - pp);
  let x = 0, sum = 0;
  while(true) {
    sum += Math.log(Math.random()) / (n - x);
    if(sum < log_q) return (pp === p ? x : n - x);
    x++;
  }
}

// Global array as cache for computation of factorial numbers  
const FACTORIALS = [0, 1];

function factorial(n) {
  // Fast factorial function using pre-calculated values up to n = 100
  const l = FACTORIALS.length;
  if(n < l) return FACTORIALS[n];
  let f = FACTORIALS[l - 1];
  for(let i = l; i <= n; i++) {
    f *= i;
    FACTORIALS.push(f);
  }
  return f;
}

function randomPoisson(lambda) {
  if(lambda < 30) {
    // Use Knuth's algorithm
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do {
      k++;
      p *= Math.random();
    } while(p > L);
    return k - 1;
  } else {
    // Use "method PA" from Atkinson, A.C. (1979). The Computer Generation of
    // Poisson Random Variables, Journal of the Royal Statistical Society
    // Series C (Applied Statistics), 28(1): 29-35.
    const c = 0.767 - 3.36 / lambda,
          beta = Math.PI / Math.sqrt(3.0 * lambda),
          alpha = beta * lambda,
          k = Math.log(c) - lambda - Math.log(beta);
    let n, u, v, x, y, lhs, rhs; 
    while(true) {
      u = Math.random();
      x = (alpha - Math.log((1.0 - u) / u)) / beta;
      n = Math.floor(x + 0.5);
      if(n < 0) continue;
      v = Math.random();
      y = alpha - beta * x;
      lhs = y + Math.log(Math.pow(v / (1.0 + Math.exp(y)), 2));
      rhs = k + n * Math.log(lambda) - Math.log(factorial(n));
      if(lhs <= rhs) return n;
    }
  }
}


/*

VIRTUAL MACHINE VECTOR INSTRUCTIONS

NOTE: The vector instructions are used to construct the Simplex tableau
that is sent to the solver. Unlike the VMI's so far, vector instructions
do not operate on the evaluation stack of an expression, but on properties
of the VM itself.

GENERAL NOTE ON DELAY PARAMETERS:

Delays always relate to links, i.e., production flows of processes,
or data flows from products. The var_index always relates to the column
number of the pertaining variable (production level of a process, stock
of a product, or a binary "on/off" or "start-up" indicator).

The var_index runs from 1 to VM.cols, where VM.cols is the number of
columns in the *static* tableau. The *actual* tableau will have N times
this number of columns, where N = block length + look-ahead.

The VM solves one "block" at a time by setting up a tableau of N*VM.cols
columns. It constructs this tableau by executing the VM instructions once
for each "time tick". VM.t is the *absolute* time tick number, to be used
when fetching result value of expressions. VM.offset is the *relative*
time tick number (0 for the first time tick in the "block" to be solved),
multiplied by VM.cols. This offset must be added to the var_index parameter
of VM instructions to get the "right" column index.

A delay of d "time ticks" means that cols*d must be subtracted from this
index, hence the actual column index k = var_index + VM.offset - d*VM.cols.
Keep in mind that var_index starts at 1 to comply with LP_SOLVE convention.

If k <= 0, this means that the decision variable for that particular time
tick (t - d) was already calculated while solving the previous block
(or equal to initial level IL if there was no previous block).
In this case, the calculated value -- multiplied by the second parameter --
should be subtracted from the RHS (for "add" instructions; added for
"subtract" decisions).

If k >= 0, the variable that should be used is a decision variable in the
current block, so the second parameter should be added to (or subtracted
from) the k'th coefficient.

*/

function VMI_set_bounds(args) {
  // `args`: [var_index, number or expression, number or expression]
  const
      vi = args[0],
      vbl = VM.variables[vi - 1][1],
      k = VM.offset + vi,
      r = VM.round_letters.indexOf(VM.round_sequence[VM.current_round]),
      // Optional fourth parameter indicates whether the solver's
      // infinity values should be used
      solver_inf = args.length > 3 && args[3],
      inf_val = (solver_inf ? VM.SOLVER_PLUS_INFINITY : VM.PLUS_INFINITY);
  let l,
      u,
      fixed = (vi in VM.fixed_var_indices[r - 1]);
  if(fixed) {
    // Set both bounds equal to the level set in the previous round, or to 0
    // if this is the first round
    if(VM.current_round) {
      l = vbl.actualLevel(VM.t);
      // QUICK PATCH! should resolve that small non-zero process levels
      // computed in prior round make problem infeasible 
      if(l < 0.0005) l = 0;
    } else {
      l = 0;
    }
    u = l;
    fixed = ' (FIXED ' + vbl.displayName + ')';
  } else {
    // Set bounds as specified by the two arguments
    l = args[1];
    if(l instanceof Expression) l = l.result(VM.t);
    if(l === VM.UNDEFINED) l = 0;
    u = args[2];
    if(u instanceof Expression) u = u.result(VM.t);
    u = Math.min(u, VM.PLUS_INFINITY);
    if(solver_inf) {
      if(l === VM.MINUS_INFINITY) l = -inf_val;
      if(u === VM.PLUS_INFINITY) u = inf_val;
    }
    fixed = '';
  }
  // NOTE: to see in the console whether fixing across rounds works, insert
  // "fixed !== '' || " before DEBUGGING below
  if(DEBUGGING) {
    console.log(['set_bounds [', k, '] ', vbl.displayName, ' t = ', VM.t,
      ' LB = ', VM.sig4Dig(l), ', UB = ', VM.sig4Dig(u), fixed].join(''));
  }
  // NOTE: since the VM vectors for lower bounds and upper bounds are
  // initialized with default values (0 for LB, +INF for UB), there is
  // no need to set them
  if(l !== 0 || u < inf_val) {
    VM.lower_bounds[k] = l; 
    VM.upper_bounds[k] = u;
    // If associated node is FROM-node of a "peak increase" link, then
    // the "peak increase" variables of this node must have the highest
    // UB of the node (for all t in this block, hence MAX) MINUS their
    // peak level in previous block
    if(vbl.peak_inc_var_index >= 0) {
      u = Math.max(0, u - vbl.b_peak[VM.block_count - 1]);
      const
          cvi = VM.chunk_offset + vbl.peak_inc_var_index,
          // Check if peak UB already set for previous t
          piub = VM.upper_bounds[cvi];
      // If so, use the highest value
      if(piub) u = Math.max(piub, u);
      VM.upper_bounds[cvi] = u;
      VM.upper_bounds[cvi + 1] = u;
    }
  }
}

function VMI_clear_coefficients(empty) {
  if(DEBUGGING) console.log('clear_coefficients');
  VM.coefficients = {};
  VM.cash_in_coefficients = {};
  VM.cash_out_coefficients = {};
  VM.rhs = 0;
}

function VMI_add_const_to_coefficient(args) {
  // `args`: [var_index, number (, delay (, 1))]
  const
      vi = args[0],
      n = args[1];
  let d = 0;
  if(args.length > 2) {
    if(args[2] instanceof Expression) {
      d = args[2].object.actualDelay(VM.t);
      // 4th argument indicates "delay + 1"
      if(args.length > 3) d++;
    } else {
      d = args[2];
    }
  }
  const
      k = VM.offset + vi - d*VM.cols,
      t = VM.t - d;
  if(DEBUGGING) {
    console.log(`add_const_to_coefficient [${k}]: ${VM.sig4Dig(n)}`);
  }
  if(k <= 0) {
    // NOTE: if `k` falls PRIOR to the start of the block being solved, this
    // means that the value of the decision variable X for which the coefficient
    // C is to be set by this instruction has been calculated while solving a
    // previous block. Since the value of X is known, adding n to C is
    // implemented as subtracting n*X from the right hand side of the
    // constraint.
    // NOTE: subtract 1 from index vi because VM.variables is a 0-based array
    const
        vbl = VM.variables[vi - 1],
        pv = VM.priorValue(vbl, t);
    if(DEBUGGING) {
      console.log(`--lookup[${k}]: ${vbl[0]} ${vbl[1].displayName} @ ${t} = ${pv}`);
    }
    // NOTE: special cases for binary variables!
    VM.rhs -= pv * n;
  } else if(k in VM.coefficients) {
    VM.coefficients[k] += n;
  } else {
    VM.coefficients[k] = n;
  }
}

function VMI_add_const_to_sum_coefficients(args) {
  // NOTE: used to implement data links with SUM multiplier
  // `args`: [var_index, number, delay (, 1)]
  const
      vi = args[0],
      d = args[2].object.actualDelay(VM.t);
  let k = VM.offset + vi - d * VM.cols,
      t = VM.t - d,
      n = args[1];
  if(args.length > 3) n /= (d + 1);
  if(DEBUGGING) {
    console.log('add_const_to_sum_coefficients [' + k + ']: ' +
      VM.sig4Dig(n) + '; delay = ' + d);
  }
  for(let i = 0; i <= d; i++) {
    if(k <= 0) {
      // See NOTE in VMI_add_const_to_coefficient instruction
      const vbl = VM.variables[vi - 1];
      if(DEBUGGING) {
        console.log('--lookup[' + k + ']: ' + vbl[0] + ' ' + vbl[1].displayName);
      }
      VM.rhs -= VM.priorValue(vbl, t) * n;
    } else if(k in VM.coefficients) {
      VM.coefficients[k] += n;
    } else {
      VM.coefficients[k] = n;
    }
    k += VM.cols;
    t++;
  }
}

function VMI_add_var_to_coefficient(args) {
  // `args`: [var_index, expression(, delay (, 0 or 1 (, weight)))]
  const vi = args[0];
  let d = 0;
  if(args.length > 2 && args[2] instanceof Expression) {
    d = args[2].object.actualDelay(VM.t);
    // 4th argument = 1 indicates "delay + 1"
    if(args.length > 3 && args[3]) d++;
  }
  const
      k = VM.offset + vi - d*VM.cols,
      t = VM.t - d;
  let r = args[1].result(t);
  // Optional 5th parameter is a constant multiplier
  if(args.length > 4) r *= args[4];
  if(DEBUGGING) {
    console.log('add_var_to_coefficient [' + k + ']: ' +
        args[1].variableName + ' (t = ' + t + ')');
  }
  if(k <= 0) {
    // See NOTE in VMI_add_const_to_coefficient instruction
    const vbl = VM.variables[vi - 1];
    if(DEBUGGING) {
      console.log('--lookup[' + k + ']: ' + vbl[0] + ' ' + vbl[1].displayName);
    }
    VM.rhs -= VM.priorValue(vbl, t) * r;
  } else if(k in VM.coefficients) {
    VM.coefficients[k] += r;
  } else {
    VM.coefficients[k] = r;
  }
}

function VMI_add_var_to_weighted_sum_coefficients(args) {
  // NOTE: Used to implement data links with SUM or MEAN multiplier
  // `args`: [var_index, number, delay (, 1)]
  const
      vi = args[0],
      v = args[1],
      d = args[2].object.actualDelay(VM.t);
  let k = VM.offset + vi - d * VM.cols,
      t = VM.t - d;
  if(DEBUGGING) {
    console.log('add_var_to_weighted_sum_coefficients [' + k + ']: ' +
        VM.sig4Dig(w) + ' * ' + v.variableName + ' (t = ' + t + ')');
  }
  for(let i = 0; i <= d; i++) {
    const r = v.result(t);
    if(args.length > 3) r /= (d + 1);
    if(k <= 0) {
      // See NOTE in VMI_add_const_to_coefficient instruction
      const vbl = VM.variables[vi - 1];
      if(DEBUGGING) {
        console.log('--lookup[' + k + ']: ' + vbl[0] + ' ' + vbl[1].displayName);
      }
      VM.rhs -= VM.priorValue(vbl, t) * r;
    } else if(k in VM.coefficients) {
      VM.coefficients[k] += r;
    } else {
      VM.coefficients[k] = r;
    }
    k += VM.cols;
    t++;
  }
}

function VMI_subtract_const_from_coefficient(args) {
  // `args`: [var_index, number (, delay (, 1))]
  const
      vi = args[0],
      n = args[1];
  let d = 0;
  if(args.length > 2 && args[2] instanceof Expression) {
    d = args[2].object.actualDelay(VM.t);
    // 4th argument indicates "delay + 1"
    if(args.length > 3) d++;
  }
  const
      k = VM.offset + vi - d*VM.cols,
      t = VM.t - d;
  if(DEBUGGING) {
    console.log('subtract_const_from_coefficient [' + k + ']: ' + VM.sig4Dig(n));
  }
  if(k <= 0) {
    // See NOTE in VMI_add_const_to_coefficient instruction
    const vbl = VM.variables[vi - 1];
    if(DEBUGGING) {
      console.log('--lookup[' + k + ']: ' + vbl[0] + ' ' + vbl[1].displayName);
    }
    VM.rhs += VM.priorValue(vbl, t) * n;
  } else if(k in VM.coefficients) {
    VM.coefficients[k] -= n;
  } else {
    VM.coefficients[k] = -n;
  }
}

function VMI_subtract_var_from_coefficient(args) {
  // `args`: [var_index, expression(, delay(, 1))]
  // NOTE: 3rd parameter may signal to use ON/OFF threshold instead of delay
  let d = 0,
      on_off = false;
  if(args.length > 2) {
    if(args[2] === VM.ON_OFF_THRESHOLD) {
      on_off = true;
    } else if(args[2] instanceof Expression) {
      d = args[2].object.actualDelay(VM.t);
      // NOTE: 4th parameter indicates "delay + 1"
      if(args.length > 3) d++;
    }
  }
  const
      vi = args[0],
      k = VM.offset + vi - d*VM.cols,
      t = VM.t - d;
  let r = args[1].result(t);
  if(on_off && Math.abs(r) < VM.ON_OFF_THRESHOLD) {
    r = VM.ON_OFF_THRESHOLD;
  }
  if(DEBUGGING) {
    console.log('subtract_var_from_coefficient [' + k + ']: ' +
        args[1].variableName + ' (t = ' + t + ')');
  }
  if(k <= 0) {
    // See NOTE in VMI_add_const_to_coefficient instruction
    const vbl = VM.variables[vi - 1];
    if(DEBUGGING) {
      console.log('--lookup[' + k + ']: ' + vbl[0] + ' ' + vbl[1].displayName);
    }
    VM.rhs += VM.priorValue(vbl, t) * r;
  } else if(k in VM.coefficients) {
    VM.coefficients[k] -= r;
  } else {
    VM.coefficients[k] = -r;
  }
}

function VMI_update_cash_coefficient(args) {
  // `args`: [flow, type, level_var_index, delay, x1, x2, ...]
  // NOTE: flow is either CONSUME or PRODUCE; type can be ONE_C (one
  // constant parameter x1), TWO_X (two expressions x1 and x2), THREE_X
  // (three expressions x1, x2 and x3) or SPIN_RES or PEAK_INC (see below)
  let d = 0;
  const
      flow = args[0],
      type = args[1],
      vi = args[2],
      dx = args[3];
  if(dx instanceof Expression) {
    d = dx.object.actualDelay(VM.t);
    // Extra argument indicates "delay + 1"
    if((type === VM.ONE_C && args.length === 6) ||
        (type === VM.TWO_X && args.length === 7)) d++;
  }
  // `k` is the tableau column index of the variable that affects the CF
  let k = (type === VM.PEAK_INC ? VM.chunk_offset + vi :
      VM.offset + vi - d*VM.cols);
  // NOTE: delay > 0 affects only which variable is to be used,
  // not the expressions for rates or prices!
  const t = VM.t - d;
  // NOTE: this instruction is used only for objective function
  // coefficients; previously computed decision variables can be ignored
  if(k <= 0) return;
  // NOTE: peak increase can generate cash only at the first time
  // step of a block (when VM.offset = 0) and at the first time step
  // of the look-ahead period (when VM.offset = block length)
  if(type === VM.PEAK_INC &&
      VM.offset > 0 && VM.offset !== MODEL.block_length) return;
  // First compute the result to be processed
  let r = 0;
  if(type === VM.ONE_C) {
    r = args[4];
  } else if(type === VM.TWO_X || type === VM.PEAK_INC) {
    // NOTE: "peak increase" always passes two expressions
    r = args[4].result(VM.t) * args[5].result(VM.t);
  } else if(type === VM.THREE_X) {
    r = args[4].result(VM.t) * args[5].result(VM.t) * args[6].result(VM.t);
  } else if(type === VM.SPIN_RES) {
    // "spinning reserve" equals UB - level if level > 0, or 0
    // The cash flow then equals ON/OFF*UB*price*rate - level*price*rate.
    // The ON/OFF variable index is passed as third argument, hence `plvi`
    // (process level variable index) as first extra parameter, plus three
    // expressions (UB, price, rate)
    const
        plvi = args[4],
        // NOTE: column of second variable will be relative to same offset
        plk = k + plvi - vi,
        ub = args[5].result(VM.t),
        price_rate = args[6].result(VM.t) * args[7].result(VM.t);
    r = ub * price_rate;
    // NOTE: the sign of r determines whether this spinning reserve will
    // generate cash IN or cash OUT; the *subtracted* part hence be ADDED
    // if r > 0, and SUBTRACTED if r < 0 (unlike the "primary" part r itself)
    if(r > 0) {
      if(plk in VM.cash_in_coefficients) {
        VM.cash_in_coefficients[plk] += price_rate;
      } else {
        VM.cash_in_coefficients[plk] = price_rate;
      }
    } else if(r < 0) {
      if(plk in VM.cash_out_coefficients) {
        VM.cash_out_coefficients[plk] -= price_rate;
      } else {
        VM.cash_out_coefficients[plk] = -price_rate;
      }
    }
  }
  // NOTE: for spinning reserve and highest increment, flow will always
  // be PRODUCE
  if(flow === VM.CONSUME) r = -r;
  if(DEBUGGING) {
    const vbl = (vi <= this.cols ? VM.variables[vi - 1] :
        VM.chunk_variables[vi - this.cols]); //@@@ TO MAKE CORRECT FOR chunk vars!
    console.log(['update_cash_coefficient [', k, ']: ', vbl[0], ' ',
        vbl[1].displayName, ' (t = ', t, ') ', VM.CF_CONSTANTS[type], ' ',
        VM.CF_CONSTANTS[flow], ' r = ', VM.sig4Dig(r)].join(''));
  }
  // Use look-ahead peak increase when offset > 0
  if(type === VM.PEAK_INC && VM.offset) k++;
  // Then update the cash flow: cash IN if r > 0, otherwise cash OUT  
  if(r > 0) {
    if(k in VM.cash_in_coefficients) {
      VM.cash_in_coefficients[k] -= r;
    } else {
      VM.cash_in_coefficients[k] = -r;
    }
  } else if(r < 0) {
    // NOTE: Test for r < 0 because no action is needed if r = 0
    if(k in VM.cash_out_coefficients) {
      VM.cash_out_coefficients[k] += r;
    } else {
      VM.cash_out_coefficients[k] = r;
    }
  }
}

function VMI_add_throughput_to_coefficient(args) {
  // Special instruction to deal with throughput calculation
  // Function: to add the contribution of variable X to the level of
  // variable Z when Z depends (a.o.) on the throughput of variable Y, i.e.,
  // X --(r2,d2)--> Y --(r1,d1)--> Z
  // The correct coefficient of X is then: r1[t]*r2[t-d1]*X[t-d1-d2]
  // `args`: [index_of_X, rate_1, delay_1, rate_2, delay_2]
  const
      vi = args[0],
      d1 = args[2].object.actualDelay(VM.t),
      d2 = (args[4] ? args[4].object.actualDelay(VM.t) : 0),
      k = VM.offset + vi - (d1 + d2)*VM.cols,
      t = VM.t - d1 - d2,
      // Compute the value to be added to the coefficient
      v = args[1].result(VM.t) * args[3].result(VM.t - d1);
  if(DEBUGGING) {
    console.log('add_throughput_to_coefficient [' + k + ']: ' +
        args[1].variableName + ' * ' + args[3].variableName +
        ' (t = ' + VM.t + ')');
  }
  if(k <= 0) {
    const vbl = VM.variables[vi - 1];
    if(DEBUGGING) {
      console.log('--lookup[' + k + ']: ' + vbl[0] + ' ' + vbl[1].displayName);
    }
    // X has been computed in a previous block => subtract term from RHS
    // NOTE: subtract 1 from var_index because VM.variables is a 0-based array
    VM.rhs -= VM.priorValue(vbl, t) * v;
  } else if(k in VM.coefficients) {
    VM.coefficients[k] += v;
  } else {
    VM.coefficients[k] = v;
  }
}

function VMI_set_objective(empty) {
  // Copies the coefficients to the vector for the objective function
  if(DEBUGGING) console.log('set_objective');
  for(let i in VM.coefficients) if(Number(i)) {
    VM.objective[i] = VM.coefficients[i];
  }
  // NOTE: For peak increase to function properly, the peak variables
  // must have a small penalty in the objective function
  if(VM.chunk_variables.length > 0) {
    for(let i = 0; i < VM.chunk_variables.length; i++) {
      const vn = VM.chunk_variables[i][0]; 
      if(vn.indexOf('peak') > 0) {
        // NOTE: chunk offset takes into account that indices are 0-based
        VM.objective[VM.chunk_offset + i] = -VM.PEAK_VAR_PENALTY;
        if(vn.startsWith('b')) VM.objective[VM.chunk_offset + i] -= VM.PEAK_VAR_PENALTY;
      }
    }
  }
}

function VMI_set_const_rhs(c) {
  if(DEBUGGING) console.log('set_const_rhs: ' + VM.sig4Dig(c));
  VM.rhs = c;
}

function VMI_set_var_rhs(x) {
  if(DEBUGGING) {
    console.log('set_var_rhs: ' + x.variableName + ' (t = ' + VM.t + ')');
  }
  VM.rhs = x.result(VM.t);
}

function VMI_add_const_to_rhs(c) {
  if(DEBUGGING) {
    console.log('add_const_to_rhs: ' + VM.sig4Dig(c));
  }
  VM.rhs += c;
}

function VMI_set_add_constraints_flag(args) {
  // Sets the VM's "add constraints" flag according to the specified arguments
  // `args` should be a boolean or an array [expression, comparator, value]
  // in which case the result of the expression is compared to the value using
  // the comparator, which can be '<', '<=', '=', '>=', '>' or '<>'
  if(typeof args === 'boolean') {
    VM.add_constraints_flag = args;
  } else {
    const
        dif = args[0].result(VM.t) - args[2],
        c = args[1]; 
    VM.add_constraints_flag =
        dif === 0 && c.indexOf('=') >= 0 ||
        dif < 0 && c.indexOf('<') >= 0 ||
        dif > 0 && c.indexOf('>') >= 0;
  }
  if(DEBUGGING) console.log('set_add_constraints_flag (now ' +
      (VM.add_constraints_flag ? 'TRUE' : 'FALSE') + ')');
}

function VMI_toggle_add_constraints_flag(empty) {
  // Toggles the VM's "add constraints" flag
  VM.add_constraints_flag = !VM.add_constraints_flag;
  if(DEBUGGING) console.log('toggle_add_constraints_flag (now ' +
      (VM.add_constraints_flag ? 'TRUE' : 'FALSE') + ')');
}

function VMI_add_constraint(ct) {
  // Appends the current coefficients as a row to the matrix, the current
  // RHS to the RHS vector, and `ct` to the constraint type vector
  // NOTE: constraint is NOT added when the "add constraints flag" is FALSE
  if(DEBUGGING) console.log('add_constraint: ' + VM.constraint_codes[ct]);
  if(VM.add_constraints_flag) {
    const row = {};
    for(let i in VM.coefficients) if(Number(i)) {
      // Do not add (near)zero coefficients to the matrix
      const c = VM.coefficients[i];
      if(Math.abs(c) >= VM.NEAR_ZERO) {
        row[i] = c;
      }
    }
    VM.matrix.push(row);
    VM.right_hand_side.push(VM.rhs);
    VM.constraint_types.push(ct);
  } else if(DEBUGGING) {
    console.log('Constraint NOT added!');
  }
}

function VMI_copy_cash_coefficients(flow) {
  // Overwrites the coefficients vector with the specified cash coefficients
  // vector (cash IN for production and cash OUT for consumption)
  if(DEBUGGING) {
    console.log('copy_cash_coefficients: ' + VM.CF_CONSTANTS[flow]);
  }
  if(flow === VM.PRODUCE) {
    VM.coefficients = Object.assign({}, VM.cash_in_coefficients);
  } else {
    VM.coefficients = Object.assign({}, VM.cash_out_coefficients);
  }
  // NOTE: This instruction also keeps track of the highest cash flow constraint
  // coefficient (to be used for scaling these constraint equations)
  for(let i in VM.coefficients) if(VM.coefficients.hasOwnProperty(i)) {
    VM.cash_scalar = Math.max(VM.cash_scalar, Math.abs(VM.coefficients[i]));
  }
  // NOTE: To permit such scaling, this instruction creates a list of constraint
  // row indices, as these are the equations that need to be scaled
  VM.cash_constraints.push(VM.matrix.length);
  // Always set RHS to 0 as cash flow constraints are EQ 0 constraints
  VM.rhs = 0;
}

function VMI_add_bound_line_constraint(args) {
  // `args`: [variable index for X, LB expression for X, UB expression for X,
  //          variable index for Y, LB expression for Y, UB expression for Y,
  //          boundline object]
  const
      vix = args[0],
      vx = VM.variables[vix - 1],  // variables is zero-based!
      objx = vx[1],
      ubx = args[2].result(VM.t),
      viy = args[3],
      vy = VM.variables[viy - 1],
      objy= vy[1],
      uby = args[5].result(VM.t),
      bl = args[6],
      x = [],
      y = [],
      w = [];
  if(DEBUGGING) {
    console.log('add_bound_line_constraint:', bl.displayName);
  }
  // NOTE: for semi-continuous processes, lower bounds > 0 should to be
  // adjusted to 0, as then 0 is part of the process level range
  let lbx = args[1].result(VM.t),
      lby = args[4].result(VM.t);
  if(lbx > 0 && objx instanceof Process && objx.level_to_zero) lbx = 0;
  if(lby > 0 && objy instanceof Process && objy.level_to_zero) lby = 0;
  
  // Since version 1.0.10, constraints are defined by piece-wise linear bound
  // lines that are defined by relative point coordinates (pX[i], pY[i])
  // where for pX[i] the value 0 corresponds to the lower bound of X, and 100
  // to the upper bound of X; similarly, for pY[i], 0 corresponds to the lower
  // bound of Y and 100 to the upper bound of Y. This representation permits
  // that these LB and UB are defined by dynamic expressions so that for each
  // time step t the actual points that define the bound line can be computed as
  // x[i] = LBX + pX[i]*(UBX - LBX) and y[i] = LBY + pY[i]*(UBY - LBY).
  // An EQ type bound line then results in three constraints that involve the
  // special ordered set variables w[i]. These variables must add up to 1, so
  // (1)  w[1] + ... + w[N] = 1
  // and furthermore, using the computed values x[i] and y[i]:
  // (2)  X - x[1]*w[1] - ... - x[N]*w[N] = 0
  // (3)  Y - y[1]*w[1] - ... - y[N]*w[N] + GE slack - LE slack = 0
  // For LE and GE type bound lines, one slack variable suffices, and = 0 must
  // be, respectively, <= 0 or >= 0

  // Scale X and Y and compute the block indices of w[i]
  let wi = VM.offset + bl.first_sos_var_index;
  const
      rx = (ubx - lbx) / 100,
      ry = (uby - lby) / 100;
  for(let i = 0; i < bl.points.length; i++) {
    x[i] = lbx + bl.points[i][0] * rx;
    y[i] = lby + bl.points[i][1] * ry;
    w[i] = wi;
    wi++;
  }
  // Add constraint (1):
  VMI_clear_coefficients();
  for(let i = 0; i < w.length; i++) {
    VM.coefficients[w[i]] = 1;
  }
  VM.rhs = 1;
  VMI_add_constraint(VM.EQ)  
  // Add constraint (2):
  VMI_clear_coefficients();
  VM.coefficients[VM.offset + vix] = 1;
  for(let i = 0; i < w.length; i++) {
    VM.coefficients[w[i]] = -x[i];
  }
  // No need to set RHS as it is already reset to 0
  VMI_add_constraint(VM.EQ)  
  // Add constraint (3):
  VMI_clear_coefficients();
  VM.coefficients[VM.offset + viy] = 1;
  for(let i = 0; i < w.length; i++) {
    VM.coefficients[w[i]] = -y[i];
  }
  if(!bl.constraint.no_slack) {
    // Add coefficients for slack variables unless omitted
    if(bl.type != VM.LE) VM.coefficients[VM.offset + bl.GE_slack_var_index] = 1;
    if(bl.type != VM.GE) VM.coefficients[VM.offset + bl.LE_slack_var_index] = -1;
  }
  // No need to set RHS as it is already reset to 0  
  VMI_add_constraint(bl.type);
}

function VMI_add_peak_increase_constraints(args) {
  // Adds constraints to compute peak increase for current block and
  // for current block + look-ahead
  const
      vi = args[0], // tableau column of L[t]
      cvi = args[1], // tableau column of peak
      lci = VM.offset + vi,
      cbici = VM.chunk_offset + cvi,
      cvbl = VM.chunk_variables[cvi][1];
  if(DEBUGGING) {
    console.log('add_peak_level_constraints (t = ' + VM.t + ')',
        VM.variables[vi - 1][0], VM.variables[vi - 1][1].displayName,
        VM.chunk_variables[cvi][0], cvbl.displayName);
  }
  // For t = 1 to block length, add constraint to compute block peak increase
  if(VM.offset < MODEL.block_length * VM.cols) {
    // (n) L[t] - BPI[b] <= BP[b-1]  (where b denotes the block number)
    VMI_clear_coefficients();
    VM.coefficients[lci] = 1;
    VM.coefficients[cbici] = -1;
    // Set RHS to highest level computed in previous blocks
    VM.rhs = cvbl.b_peak[VM.block_count - 1];
    VMI_add_constraint(VM.LE);
    return;
  }
  // For every t = block length + 1 to chunk length:
  VMI_clear_coefficients();
  // (o) L[t] - BPI[b] - CPI[b] <= BP[b-1]
  VM.coefficients[lci] = 1;
  VM.coefficients[cbici] = -1;
  // NOTE: next index always points to LA peak increase 
  VM.coefficients[cbici + 1] = -1;
  // Set RHS to highest level computed in previous blocks
  VM.rhs = cvbl.b_peak[VM.block_count - 1];
  VMI_add_constraint(VM.LE);
}

function VMI_add_peak_increase_at_t_0(args) {
  // This operation should result in adding peak increase[b] * link rate
  // to the product level for which a constraint is being defined.
  // This means that the coefficient for (B or LA) peak increase[b] must
  // equal the link rate.
  // NOTE: only execute this operation at start of block or of LA period
  if(VM.offset && VM.offset !== MODEL.block_length * VM.cols) return;
  const
      cvi = args[0] + (VM.offset ? 1 : 0),
      tpl = VM.chunk_variables[cvi],
      rr = args[1].result(VM.t);
  if(DEBUGGING) {
    console.log('VMI_add_peak_increase_at_t_0 (t = ' + VM.t + ')',
        tpl[0], tpl[1].displayName);
  }
  VM.coefficients[VM.chunk_offset + cvi] = rr;
  // NOTE: no "add constraint" as this instruction is only part of the
  // series of coefficient-setting instructions
}

// NOTE: the global constants below are not defined in linny-r-globals.js
// because some comprise the identifiers of functions for VM instructions

const
  // Valid symbols in expressions
  PARENTHESES = '()',
  OPERATOR_CHARS = ';?:+-*/%=!<>^|',
  // Opening bracket, space and single quote indicate a separation
  SEPARATOR_CHARS = PARENTHESES + OPERATOR_CHARS + "[ '",
  COMPOUND_OPERATORS = ['!=', '<>', '>=', '<='],
  CONSTANT_SYMBOLS = [
      't', 'rt', 'bt', 'b', 'N', 'n', 'l', 'r', 'lr', 'nr', 'x', 'nx',
      'random', 'dt', 'true', 'false', 'pi', 'infinity', '#',
      'i', 'j', 'k', 'yr', 'wk', 'd', 'h', 'm', 's'],
  CONSTANT_CODES = [
      VMI_push_time_step, VMI_push_relative_time, VMI_push_block_time,
      VMI_push_block_number, VMI_push_run_length, VMI_push_block_length,
      VMI_push_look_ahead, VMI_push_round, VMI_push_last_round,
      VMI_push_number_of_rounds, VMI_push_run_number, VMI_push_number_of_runs,
      VMI_push_random, VMI_push_delta_t, VMI_push_true, VMI_push_false,
      VMI_push_pi, VMI_push_infinity, VMI_push_contextual_number,
      VMI_push_i, VMI_push_j, VMI_push_k,
      VMI_push_year, VMI_push_week, VMI_push_day, VMI_push_hour,
      VMI_push_minute, VMI_push_second],
  DYNAMIC_SYMBOLS = ['t', 'rt', 'bt', 'b', 'r', 'random', 'i', 'j', 'k'],
  MONADIC_OPERATORS = [
      '~', 'not', 'abs', 'sin', 'cos', 'atan', 'ln',
      'exp', 'sqrt', 'round', 'int', 'fract', 'min', 'max',
      'binomial', 'exponential', 'normal', 'poisson', 'triangular',
      'weibull', 'npv'],
  MONADIC_CODES = [
      VMI_negate, VMI_not, VMI_abs, VMI_sin, VMI_cos, VMI_atan, VMI_ln,
      VMI_exp, VMI_sqrt, VMI_round, VMI_int, VMI_fract, VMI_min, VMI_max,
      VMI_binomial, VMI_exponential, VMI_normal, VMI_poisson, VMI_triangular,
      VMI_weibull, VMI_npv],
  DYADIC_OPERATORS = [
      ';', '?', ':', 'or', 'and',
      '=', '<>', '!=',
      '>', '<', '>=', '<=', '+', '-', '*', '/',
      '%', '^', 'log', '|'],
  DYADIC_CODES = [
      VMI_concat, VMI_if_then, VMI_if_else, VMI_or, VMI_and,
      VMI_eq, VMI_ne, VMI_ne,
      VMI_gt, VMI_lt, VMI_ge, VMI_le, VMI_add, VMI_sub, VMI_mul, VMI_div,
      VMI_mod, VMI_power, VMI_log, VMI_replace_undefined],

  // Compiler checks for random codes as they make an expression dynamic
  RANDOM_CODES = [VMI_binomial, VMI_exponential, VMI_normal, VMI_poisson,
      VMI_triangular, VMI_weibull],
  
  // Compiler checks for reducing codes to unset its "concatenating" flag
  REDUCING_CODES = [VMI_min, VMI_max, VMI_binomial, VMI_normal,
      VMI_triangular, VMI_weibull, VMI_npv],
  
  // Custom operators may make an expression level-based
  LEVEL_BASED_CODES = [],
  
  OPERATORS = DYADIC_OPERATORS.concat(MONADIC_OPERATORS), 
  OPERATOR_CODES = DYADIC_CODES.concat(MONADIC_CODES),
  PRIORITIES = [1, 2, 2, 3, 4, 5, 5, 5, 5, 5, 5, 5, 6, 6, 7, 7, 7, 8, 8, 10,
      9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9],
  ACTUAL_SYMBOLS = CONSTANT_SYMBOLS.concat(OPERATORS),
  SYMBOL_CODES = CONSTANT_CODES.concat(OPERATOR_CODES);

//
// *** API section for custom operators ***
//

// Custom operators are typically used to implement computations on model results
// that cannot be coded (efficiently) using standard expressions.
// The first custom operator in this section demonstrates by example how custom
// operators can be added.

// Custom operators should preferably have a short alphanumeric string as
// their identifying symbol. Custom operators are monadic and reducing, i.e.,
// they must have a grouping as operand. The number of required arguments must
// be checked at run time by the VM instruction for this operator.

// Each custom operator must have its own Virtual Machine instruction
  
function VMI_profitable_units(x, empty) {
  // Replaces the argument list that should be at the top of the stack by the
  // number of profitable units having a standard capacity (number), given the
  // level (vector) of the process that represents multiple such units, the
  // marginal cost (constant) and the market price (vector)
  const d = x.top();
  // Check whether the top stack element is a grouping of the correct size
  // that contains arguments of the correct type
  if(d instanceof Array && d.length >= 4 &&
      typeof d[0] === 'object' && d[0].entity instanceof Process &&
      typeof d[1] === 'number' && d[1] > VM.SIG_DIF_FROM_ZERO &&
      typeof d[2] === 'number' &&
      typeof d[3] === 'object' && d[3].hasOwnProperty('entity') &&
      (d[3].entity.attributeValue(d[3].attribute) ||
          d[3].entity.attributeExpression(d[3].attribute)) &&
      (d.length === 4 || (typeof d[4] === 'number' &&
          (d.length === 5 || typeof d[5] === 'number')))) {
    // Valid parameters => get the data required for computation
    const
        mup = d[0].entity, // the multi-unit process
        ub = mup.upper_bound.result(0), // NOTE: UB is assumed to be static 
        uc = d[1], // the single unit capacity
        mc = d[2], // the marginal cost
        mpe = d[3].entity, // the market price entity
        mpa = d[3].attribute,
        pt = (d.length > 4 ? d[4] : 0), // the profit threshold (0 by default)
        // the time horizon (by default the length of the simulation period)
        nt = (d.length > 5 ? d[5] : MODEL.end_period - MODEL.start_period + 1); 
    // Handle exceptional values of `uc` and `mc`
    if(uc <= VM.BEYOND_MINUS_INFINITY || mc <= VM.BEYOND_MINUS_INFINITY) {
      x.retop(Math.min(uc, mc));
      return;
    }
    if(uc >= VM.BEYOND_PLUS_INFINITY || mc >= VM.BEYOND_PLUS_INFINITY) {
      x.retop(Math.max(uc, mc));
      return;
    }
    
    // NOTE: NPU is not time-dependent => result is stored in cache
    // As expressions may contain several NPU operators, create a unique key
    // based on its parameters
    const cache_key = ['npu', mup.code, ub, uc, mc, mpe.code, mpa, pt].join('_');
    if(x.cache[cache_key]) {
      x.retop(x.cache[cache_key]);
      return;
    }
    
    // mp can be a single value, a vector, or an expression
    let mp = mpe.attributeValue(mpa);
    if(mp === null) {
      mp = mpe.attributeExpression(mpa);
    }
    if(DEBUGGING) console.log('*Profitable Units for '+ mup.displayName);
    // The marginal revenue R[i] of the i-th unit equals the sum (over t) of
    //   min(uc; max(0, l[t] - i*uc)) * (mp[t] – mc)
    // The i-th unit is considered to be profitable if R[i] > pt
    // The number of profitable units then equals max({i: R[i] > pt})
    
    const
        nu = Math.ceil(ub / uc), // Number of units
        r = [];
    if(mp && mp instanceof Expression) {
      // NOTE: an expression may not have been (fully) computed yet
      mp.compute();
      if(mp.isStatic) {
        mp = mp.result(0);
      } else {
        for(let t = 1; t <= nt; t++) mp.result(t);
        mp = mp.vector;
      }
    }
    // Initialize total revenue = 0 for each unit
    for(let i = 0; i < nu; i++) r.push(0);
    let cuc, // cumulative unit capacity
        upi; // production of unit i in time step t
    // Iterate over all time steps
    for(let t = 1; t <= nt; t++) {
      const mpr = Array.isArray(mp) ? mp[t] : mp;
      // Handle exceptional market price (if any)
      if(mpr <= VM.BEYOND_MINUS_INFINITY || mc >= VM.BEYOND_PLUS_INFINITY) {
        x.retop(mpr);
        return;
      }
      const
          // Marginal revenue = market price at time t minus marginal cost
          mr = mpr - mc,
          // Actual level of the multi-unit process at time t
          l = mup.actualLevel(t);
      // Handle exceptional process level (if any)
      if(l <= VM.BEYOND_MINUS_INFINITY || l >= VM.BEYOND_PLUS_INFINITY) {
        x.retop(l);
        return;
      }
      cuc = 0;
      // Iterate over all units i until unit i is NOT committed
      for(let i = 0; i < nu && (upi = Math.min(uc, l - cuc)) > 0; i++) {
        // Revenue = actual commitment times marginal revenue
        r[i] += upi * mr;
        // Increase cumulative unit capacity
        cuc += uc;
      }
    }
    // Count the number of units with revenu > profitability threshold
    let npu = 0;
    for(let i = 0; r[i] - pt > VM.NEAR_ZERO; i++) npu++;
    // Store the result in the expression's cache
    x.cache[cache_key] = npu;
    // Push the result onto the stack
    x.retop(npu);
    return;
  }
  // Fall-trough indicates error
  if(DEBUGGING) console.log('Profitable Units: invalid parameter(s)\n', d);
  x.retop(VM.PARAMS);
}

// Add the custom operator instruction to the global lists
// NOTE: All custom operators are monadic (priority 9) and reducing
OPERATORS.push('npu');
MONADIC_OPERATORS.push('npu');
ACTUAL_SYMBOLS.push('npu');
OPERATOR_CODES.push(VMI_profitable_units);
MONADIC_CODES.push(VMI_profitable_units);
REDUCING_CODES.push(VMI_profitable_units);
SYMBOL_CODES.push(VMI_profitable_units);
PRIORITIES.push(9);
// Add to this list only if operation makes an expression dynamic
DYNAMIC_SYMBOLS.push('npu');
// Add to this list only if operation makes an expression random
// RANDOM_CODES.push(VMI_...);
// Add to this list only if operation makes an expression level-based
LEVEL_BASED_CODES.push(VMI_profitable_units);


function VMI_highest_cumulative_consecutive_deviation(x, empty) {
  // Replaces the argument list that should be at the top of the stack by
  // the HCCD (as in the function name) of the vector V that is passed as
  // the first argument of this function. The HCCD value is computed by
  // first iterating over the vector to obtain a new vector A that
  // aggregates its values by blocks of B numbers of the original vector,
  // while computing the mean value M. Then it iterates over A to compute
  // the HCCD: the sum of deviations d = a[i] - M for consecutive i
  // until the sign of d changes. Then the HCCD (which is initially 0)
  // is udated to max(HCCD, |sum|). The eventual HCCD can be used as
  // estimator for the storage capacity required for a stock having a
  // net inflow as specified by the vector.  
  // The function takes up to 4 elements: the vector V, the block length
  // B (defaults to 1), the index where to start (defaults to 1) and the
  // index where to end (defaults to the length of V)
  const
      d = x.top(),
      vmi = 'Highest Cumulative Consecutive Deviation';
  // Check whether the top stack element is a grouping of the correct size
  if(d instanceof Array && d.length >= 1 &&
      typeof d[0] === 'object' && d[0].hasOwnProperty('entity')) {
    const
        e = d[0].entity,
        a = d[0].attribute;
    let vector = e.attributeValue(a);
    // NOTE: equations can also be passed by reference
    if(e === MODEL.equations_dataset) {
      const x = e.modifiers[a].expression;
      // NOTE: an expression may not have been (fully) computed yet
      x.compute();
      if(!x.isStatic) {
        const nt = MODEL.end_period - MODEL.start_period + 1;
        for(let t = 1; t <= nt; t++) x.result(t);
      }
      vector = x.vector;
    }
    if(Array.isArray(vector) &&
      // Check that other arguments are numbers
      (d.length === 1 || (typeof d[1] === 'number' &&
          (d.length === 2 || typeof d[2] === 'number' &&
              (d.length === 3 || typeof d[3] === 'number'))))) {
      // Valid parameters => get the data required for computation
      const
          name = e.displayName + (a ? '|' + a : ''),
          block_size = d[1] || 1,
          first = d[2] || 1,
          last = d[3] || vector.length - 1,
          // Handle exceptional values of the parameters
          low = Math.min(block_size, first, last),
          high = Math.min(block_size, first, last);
      if(low <= VM.BEYOND_MINUS_INFINITY) {
        x.retop(low);
        return;
      }
      if(high >= VM.BEYOND_PLUS_INFINITY) {
        x.retop(high);
        return;
      }
      
      // NOTE: HCCD is not time-dependent => result is stored in cache
      // As expressions may contain several HCCD operators, create a unique key
      // based on its parameters
      const cache_key = ['hccd', e.identifier, a, block_size, first, last].join('_');
      if(x.cache[cache_key]) {
        x.retop(x.cache[cache_key]);
        return;
      }
      
      if(DEBUGGING) console.log(`*${vmi} for ${name}`);
      
      // Compute the aggregated vector and sum
      let sum = 0,
          b = 0,
          n = 0,
          av = [];
      for(let i = first; i <= last; i++) {
        const v = vector[i];
        // Handle exceptional values in vector
        if(v <= VM.BEYOND_MINUS_INFINITY || v >= VM.BEYOND_PLUS_INFINITY) {
          x.retop(v);
          return;
        }
        sum += v;
        b += v;
        if(n++ === block_size) {
          av.push(b);
          n = 0;
          b = 0;
        }
      }
      // Always push the remaining block sum, even if it is 0
      av.push(b);
      // Compute the mean (per block)
      const mean = sum / av.length;
      let hccd = 0,
          positive = av[0] > mean;
      sum = 0;
      // Iterate over the aggregated vector
      for(let i = 0; i < av.length; i++) {
        const v = av[i];
        if((positive && v < mean) || (!positive && v > mean)) {
          hccd = Math.max(hccd, Math.abs(sum));
          sum = v;
          positive = !positive;
        } else {
          // No sign change => add deviation
          sum += v;
        }
      }
      hccd = Math.max(hccd, Math.abs(sum));
      // Store the result in the expression's cache
      x.cache[cache_key] = hccd;
      // Push the result onto the stack
      x.retop(hccd);
      return;
    }
  }
  // Fall-trough indicates error
  if(DEBUGGING) console.log(vmi + ': invalid parameter(s)\n', d);
  x.retop(VM.PARAMS);
}

// Add the custom operator instruction to the global lists
// NOTE: All custom operators are monadic (priority 9) and reducing
OPERATORS.push('hccd');
MONADIC_OPERATORS.push('hccd');
ACTUAL_SYMBOLS.push('hccd');
OPERATOR_CODES.push(VMI_highest_cumulative_consecutive_deviation);
MONADIC_CODES.push(VMI_highest_cumulative_consecutive_deviation);
REDUCING_CODES.push(VMI_highest_cumulative_consecutive_deviation);
SYMBOL_CODES.push(VMI_highest_cumulative_consecutive_deviation);
PRIORITIES.push(9);
// Add to this list only if operation makes an expression dynamic
DYNAMIC_SYMBOLS.push('hccd');
// Add to this list only if operation makes an expression random
// RANDOM_CODES.push(VMI_...);
// Add to this list only if operation makes an expression level-based
// LEVEL_BASED_CODES.push(VMI_...);

/*** END of custom operator API section ***/

///////////////////////////////////////////////////////////////////////
// Define exports so that this file can also be included as a module //
///////////////////////////////////////////////////////////////////////
if(NODE) module.exports = {
  Expression: Expression,
  ExpressionParser: ExpressionParser,
  VirtualMachine: VirtualMachine
}
