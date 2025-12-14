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
Copyright (c) 2017-2025 Delft University of Technology

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

// CLASS Expression
class Expression {
  constructor(obj, attr, text) {
    // Expressions are typically defined for some attribute of some
    // entity -- legacy convention is to refer to a model entity
    // as `object` rather than `entity`.
    this.object = obj;
    this.attribute = attr;
    this.text = text;
    // For method expressions only: the object to which they apply.
    // This will be set dynamically by the VMI_push_method instruction.
    this.method_object = null;
    // Likewise, VMI_push_method may set the method object prefix if
    // the specific entity needs to be inferred dynamically.
    this.method_object_prefix = '';
     // A stack for local time step (to allow lazy evaluation).
    this.step = [];
    // An operand stack for computation (elements must be numeric).
    this.stack = []; 
    // NOTE: code = NULL indicates: not compiled yet.
    this.code = null;
    // Error message when last compiled.
    this.compile_issue = '';
    // Error message when last computed.
    this.compute_issue = '';
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
    // Method expressions are similar to wildcard expressions, but have
    // not natural numbering scheme. By keeping a list of all objects
    // to which a method has been applied, the index of such an object
    // in this list serves as the vector number.
    this.method_object_list = [];
    // Special instructions can store results as cache properties to save
    // (re)computation time; cache is cleared when expression is reset.
    this.cache = {};
  }
  
  get isWildcardExpression() {
    // Return TRUE if the owner is a dataset, and the attribute contains
    // wildcards.
    return this.object instanceof Dataset &&
        this.object.isWildcardSelector(this.attribute); 
  }
  
  get isMethod() {
    // Return TRUE if the owner is the equations dataset, and the
    // attribute starts with a colon.
    return this.object === MODEL.equations_dataset &&
        this.attribute.startsWith(':'); 
  }
  
  get noMethodObject() {
    // Return TRUE if expression is a method that does not apply to
    // any entity group.
    return this.isMethod && !(this.eligible_prefixes &&
         Object.keys(this.eligible_prefixes).length > 0);
  }

  matchWithEligiblePrefixes(pref) {
    // Return the entity for which `pref` matches with an eligible prefix
    // of this expression.
    // NOTE: This expression must have been compiled to "know" its
    // eligible prefixes.
    this.compile();
    // NOTE: Prevent infinite recursion, but do not generate a warning;
    // the expression parser will do this. 
    if(this.compiling || !this.eligible_prefixes) return false;
    return this.eligible_prefixes[pref.toLowerCase()] || false;
  }

  isEligible(prefix) {
    // Return TRUE if `prefix` is an eligible prefix for this method.
    if(this.eligible_prefixes) {
      return this.eligible_prefixes[prefix.toLowerCase()] || false;
    }
    return false;
  }
  
  get variableName() {
    // Return the name of the variable computed by this expression.
    if(this.object === MODEL.equations_dataset) return 'equation ' + this.attribute;
    if(this.object) return this.object.displayName + '|' + this.attribute;
    return 'Unknown variable (no object)';
  }

  get timeStepDuration() {
    // Return dt for dataset if this is a dataset modifier expression;
    // otherwise dt for the current model.
    if(this.object instanceof Dataset) {
      return this.object.time_scale * VM.time_unit_values[this.object.time_unit];
    }
    return MODEL.timeStepDuration;
  }
  
  get referencedEntities() {
    // Return a list of entities referenced in this expression.
    return MODEL.entitiesInString(this.text);
  }

  update(parser) {
    // Must be called after successful compilation by the expression parser.
    this.text = parser.expr;
    this.code = parser.code;
    this.eligible_prefixes = parser.eligible_prefixes;
    // NOTE: Overrule `is_static` to make that the "initial level" attribute
    // is always evaluated for t=1.
    this.is_static = (this.attribute === 'IL' ? true : parser.is_static);
    this.is_level_based = parser.is_level_based;
    this.reset();
  }

  reset(default_value=VM.NOT_COMPUTED) {
    // Clear result of previous computation (if any).
    this.method_object = null;
    this.compile_issue = '';
    this.compute_issue = '';
    this.step.length = 0;
    this.stack.length = 0;
    this.wildcard_vectors = {};
    this.wildcard_vector_index = false;
    this.method_object_list.length = 0;
    this.cache = {};
    this.compile(); // if(!this.compiled)  REMOVED to ensure correct isStatic!! 
    // Static expressions only need a vector with one element (having index 0)
    if(this.is_static) {
      // NOTE: Empty expressions (i.e., no text) may default to different
      // values: typically 0 for lower bounds, infinite for upper process
      // bounds, etc., so this value must be passed as parameter.
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
      this.compile_issue = xp.error;
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
      // Get all entity names that occur in this expression.
      const vl = text.match(/\[[^\[]+\]/g);
      if(vl) for(const v of vl) {
        // Trim enclosing brackets and remove the "tail" (attribute or offset).
        let tail = '',
            e = v.substring(1, v.length - 1).split('|');
        if(e.length > 1) {
          tail = '|' + e.pop();
          e = e.join('|');
        } else {
          e = e[0].split('@');
          if(e.length > 1) {
            tail = '@' + e.pop();
            e = e.join('@');
          } else {
            e = e[0];
          }
        }
        // Link names and constraint names comprise two entities.
        // If so, process both entity names.
        let arrow = UI.LINK_ARROW,
            parts = e.split(arrow);
        if(parts.length === 1) {
          arrow = UI.CONSTRAINT_ARROW;
          parts = e.split(arrow);
        }
        if(parts.length > 1) {
          let n = 0;
          const enl = [];
          for(const en of parts) {
            const id = UI.nameToID(en);
            if(MODEL.black_box_entities.hasOwnProperty(id)) {
              enl.push(MODEL.black_box_entities[id]);
              n++;
            } else {
              enl.push(en);
            }
          }
          if(n > 0) {
            text = text.replace(v, '[' + enl.join(arrow) + tail + ']');
          }
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
        action = `[${this.step.join(', ')}] ${action}`;
      }
      console.log(action);
    }
  }
  
  chooseVector(number) {
    // Return the vector to use for computation (defaults to "own" vector).
    // NOTE: Static wildcard and method expressions must also choose a vector!
    if((typeof number !== 'number' ||
        (this.isStatic && !this.isWildcardExpression)) &&
        !this.isMethod) return this.vector;
    // Method expressions are not "numbered" but differentiate by the
    // entity to which they are applied. Their "vector number" is then
    // inferred by looking up this entity in a method object list.
    const mop = (this.method_object && this.method_object.identifier) ||
        this.method_object_prefix || '';
    if(mop) {
      number = this.method_object_list.indexOf(mop);
      if(number < 0) {
        this.method_object_list.push(mop);
        number = this.method_object_list.length - 1;
      }
    }
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
    // Stack should now have length 1. If not, report error unless the
    // length is due to some other error.
    if(this.stack.length > 1) {
      if(v[t] > VM.ERROR) v[t] = VM.OVERFLOW;
    } else if(this.stack.length < 1) {
      if(v[t] > VM.ERROR) v[t] = VM.UNDERFLOW;
    } else {
      v[t] = VM.noNearZero(this.stack.pop());
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
    // problematic unless they result in an error (stack over/underflow).
    if(v[t] <= VM.ERROR) {
      // NOTE: Record the first issue that is detected.
      if(!this.compute_issue) this.compute_issue = VM.errorMessage(v[t]);      
      MONITOR.showCallStack(t);
      VM.logCallStack(t);
    }
    // Always pop the expression from the call stack.
    VM.call_stack.pop(this);
    return true;
  }

  result(t, number=false) {
    // Compute (only if needed) and then returns result for time step t.
    // The `number` is passed only by the VMI_push_dataset_modifier
    // instruction so as to force recomputation of the expression.
    // Select the vector to use.
    const v = this.chooseVector(number);
    if(!Array.isArray(v)) {
      console.log('ANOMALY: No vector for result(t)');
      return VM.UNDEFINED;
    }
    // NOTE: For t < 1 return the value for t = 1, since expressions have
    // no "initial value" (these follow from the variables used in the
    // expression).
    if(t < 0 || this.isStatic) t = 0;
    if(t >= v.length) return VM.UNDEFINED;
    // Check for recursive calls.
    if(v[t] === VM.COMPUTING) {
      console.log('Already computing expression for', this.variableName);
      console.log(this.text);
      return VM.CYCLIC;
    }
    // NOTES:
    // (1) When VM is setting up a tableau, values computed for the
    //     look-ahead period must be recomputed.
    // (2) Always recompute value for sensitivity analysis parameter, as
    //     otherwise the vector value will be scaled cumulatively.
    const sap = (this === MODEL.active_sensitivity_parameter);
    if(sap || v[t] === VM.NOT_COMPUTED || v[t] === VM.COMPUTING ||
      (!this.isStatic && VM.inLookAhead(t))) {
      v[t] = VM.NOT_COMPUTED;
      this.compute(t, number);
    }
    // NOTE: When this expression is the "active" parameter for sensitivity
    // analysis, the result is multiplied by 1 + delta %.
    if(sap) {
      // NOTE: Do NOT scale exceptional values.
      if(v[t] > VM.MINUS_INFINITY && v[t] < VM.PLUS_INFINITY) {
        v[t] *= (1 + MODEL.sensitivity_delta * 0.01);
      }
    }
    return v[t];
  }

  get asAttribute() {
    // Return the result for the current time step if the model has been
    // solved (with special values as human-readable string), or the
    // expression as text.
    if(!(MODEL.solved || this.isStatic)) return this.text;
    const sv = VM.specialValue(this.result(MODEL.t))[1];
    // NOTE: ?? is replaced by empty string to facilitate copy/paste to
    // Excel-like spreadsheets, where an empty cell indicates "undefined".
    if(sv === '\u2047') return '';
    return sv;
  }
  
  push(value) {
    // Push a numeric value onto the computation stack.
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
    // Return the top element of the stack, or FALSE if the stack was empty.
    if(this.stack.length < 1) {
      this.trace('TOP: UNDERFLOW');
      this.stack = [VM.UNDERFLOW];
      this.computed = true;
      return false;
    }
    const top = this.stack[this.stack.length - 1]; 
    // Check for errors, "undefined", "not computed", and "still computing".
    if(top < VM.MINUS_INFINITY || top > VM.EXCEPTION) {
      // If error or exception, ignore UNDEFINED if `no_check` is TRUE.
      if(no_check && top <= VM.UNDEFINED) return top;
      // Otherwise, leave the special value on top of the stack, and
      // return FALSE so that the VM instruction will not alter it.
      this.trace(
          VM.errorMessage(top) + ' at top of stack: ' + this.stack.toString());
      return false;
    }
    return top;
  }

  pop(no_check=false) {
    // Return the two top elements A and B as [A, B] after popping the
    // top element B from the stack, or FALSE if the stack contains fewer
    // than 2 elements, or if A and/or B are error values.
    if(this.stack.length < 2) {
      this.trace('POP: UNDERFLOW');
      this.stack.push(VM.UNDERFLOW);
      this.computed = true;
      return false;
    }
    // Get the top two numbers on the stack as a list.
    const dyad = this.stack.slice(-2);
    // Pop only the top one.
    this.stack.pop();
    // Check whether either number is an error code.
    let check = Math.min(dyad[0], dyad[1]);
    if(check < VM.MINUS_INFINITY &&
        // Exception: "array index out of bounds" error may also be
        // ignored by using the | operator.
        !(no_check && check === VM.ARRAY_INDEX)) {
      // If error, leave the most severe error on top of the stack.
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
    // No issue(s)? Then return the dyad.
    return dyad;
  }

  retop(value) {
    // Replace the top element of the stack by the new value.
    // NOTE: Do not check the stack length, as this instruction typically
    // follows a TOP or POP instruction.
    this.stack[this.stack.length - 1] = value;
    return true;
  }
  
  replaceAttribute(re, a1, a2) {
    // Replace occurrences of attribute `a1` by `a2` for all variables
    // that match the regular expression `re`.
    let n = 0;
    const matches = this.text.match(re);
    if(matches) {
      // Match is case-insensitive, so check each for matching case of
      // attribute.
      for(const m of matches) {
        const
            e = m.split('|'),
            // Let `ao` be attribute + offset (if any) without right bracket.
            ao = e.pop().slice(0, -1),
            // Then also trim offset and spaces.
            a = ao.split('@')[0].trim();
        // Check whether `a` (without bracket and without spaces) indeed
        // matches `a1`.
        if(a === a1) {
          // If so, append new attribute plus offset plus right bracket...
          e.push(ao.replace(a, a2) + ']');
          // ... and replace the original match by the ensemble.
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
    // NOTE: When expressions for dataset modifiers or equations are
    // parsed, `owner` is their dataset, and `attribute` is their name.
    this.owner = owner;
    this.owner_prefix = '';
    this.attribute = attribute;
    // `text` is the expression string to be parsed.
    this.expr = text;
    this.expansions = [];
    // Initialize eligible entities as NULL so it will be initialized
    // when the first method expression variable is parsed.
    this.eligible_prefixes = null;
    // When parsing a method expression, keep a list of all attributes
    // used in variables.
    this.method_attributes = [];
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
      this.owner_prefix = UI.entityPrefix(
          owner === MODEL.equations_dataset ? attribute : owner.displayName);
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
    // Remove non-functional whitespace.
    name = name.replace(/\s+/g, ' ').trim();
    
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
    // Experiment result specifier (optional) must be leading and braced.
    // Specifier format: {method$title|run} where method$ and title| are
    // optional. The run specifier may be a # followed by a run number, or
    // a comma- or space-separated list of selectors.
    // NOTE: # in title or run is NOT seen as a wildcard.
    if(name.startsWith('{')) {
      s = name.split('}');
      if(s.length > 1) {
        // Brace pair => interpret it as experiment result reference.
        const x = {
            x: false, // experiment
            r: false, // run number
            v: false, // variable; if parametrized {n: name seg's, p: indices}  
            s: '',    // statistic
            m: '',    // method 
            p: false, // periodic
            nr: false // run number range
          };
        // NOTE: Name should then be in the experiment's variable list.
        // This will be checked later, after validating the run specifier.
        name = s[1].trim();
        s = s[0].substring(1);
        // Check for a time scaling method (used only for dataset run results).
        // NOTE: Simply ignore $ unless it indicates a valid method.
        const msep = s.indexOf('$');
        if(msep <= 5) {
          // Be tolerant as to case.
          let method = s.substring(0, msep).toUpperCase();
          if(method.endsWith('P')) {
            x.p = true;
            method = method.slice(0, -1);
          }
          if(['ABS', 'MEAN', 'SUM', 'MAX', ''].indexOf(method) >= 0) {
            x.m = method;
            s = s.substring(msep + 1).trim();
          }
        }
        // Now `s` may still have format title|run specifier.
        let x_title = '',
            run_spec = '';
        s = s.split('|');
        if(s.length > 2) {
          msg = `Experiment result specifier may contain only one "|"`;
        } else {
          if(s.length == 2) {
            run_spec = s.pop().trim();
            x_title = s[0].trim();
          } else {
            // No vertical bar => no title, only the run specifier.
            run_spec = s[0].trim();
          }
          // Run specifier can start with a # sign... 
          if(!run_spec.startsWith('#')) {
            // ... and if not, it is assumed to be a list of modifier selectors
            // that will identify (during problem set-up) a specific run.
            // NOTE: Permit selectors to be separated by any combination
            // of commas, semicolons and spaces.
            x.r = run_spec.split(/[\,\;\/\s]+/g);
            // NOTE: The VMI instruction accepts `x.r` to be a list of selectors
            // or an integer number. 
          } else {
            // If the specifier does start with a #, trim it...
            run_spec = run_spec.substring(1);
            // ... and then
            // NOTE: Special notation for run numbers to permit modelers
            // to chart results as if run numbers are on the time axis
            // (with a given step size). The chart will be made as usual,
            // i.e., plot a point for each time step t, but the value v[t]
            // will then stay the same for the time interval that corresponds
            // to simulation period length / number of runs.
            // NOTE: This will fail to produce a meaningful chart when the
            // simulation period is small compared to the number of runs.
            if(run_spec.startsWith('n')) {
              // #n may be followed by a range, or this range defaults to
              // 0 - last run number. Of this range, the i-th number will
              // be used, where i is computes as:
              // floor(current time step * number of runs / period length)
              const range = run_spec.substring(1);
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
              const n = parseInt(run_spec);
              if(isNaN(n)) {
                msg = `Invalid experiment run number "${run_spec}"`;
              } else {
                // NOTE: Negative run numbers are acceptable.
                x.r = n;
              }
            }
          }
        }
        // NOTE: Experiment title cannot be parametrized with a # wildcard.
        if(x_title) {
          const n = MODEL.indexOfExperiment(x_title);
          if(n < 0) {
            msg = `Unknown experiment "${x_title}"`;
          } else {
            x.x = MODEL.experiments[n];
          }
        }
        // If run specifier `x.r` is a list, check whether all elements in the
        // list are selectors in a dimension of experiment `x.x` (if specified).
        // If experiment is unknown, check against the list of all selectors
        // defined in the model.
        if(Array.isArray(x.r)) {
          const
              sl = (x.x instanceof Experiment ? x.x.allDimensionSelectors :
                  Object.keys(MODEL.dictOfAllSelectors)),
              unknown = complement(x.r, sl);
          if(unknown.length) {
            msg = pluralS(unknown.length, 'unknown selector') + ': <tt>' +
                unknown.join(' ') + '</tt>';
          }
        }
        // END of code for parsing an experiment result specifier.
        // Now proceed with parsing the variable name.
        
        // Variable name may start with a (case insensitive) statistic
        // specifier such as SUM or MEAN.
        s = name.split('$');
        if(s.length > 1) {
          const stat = s[0].trim().toUpperCase();
          // NOTE: Simply ignore $ (i.e., consider it as part of the
          // variable name) unless it is preceded by a valid statistic.
          if(VM.outcome_statistics.indexOf(stat) >= 0) {
            x.s = stat;
            name = s[1].trim();
          }
        }
        // Variable name may start with a colon to denote that the owner
        // prefix should be added.
        name = UI.colonPrefixedName(name, this.owner_prefix);
        // First check whether name refers to a valid attribute of an
        // existing model entity.
        const check = MODEL.validVariable(name);
        if(check !== true) {
          // If not TRUE, check will be an error message. 
          msg = check;
        } else if(x.x) {
          // Look up name in experiment outcomes list.
          x.v = x.x.resultIndex(name);
          if(x.v < 0 && name.indexOf('#') >= 0 &&
             typeof this.context_number === 'number') {
            // Variable name may be parametrized with #, but not in
            // expressions for wildcard selectors.
            name = name.replace('#', this.context_number);
            x.v = x.x.resultIndex(name);
          }
          if(x.v < 0) {
            msg = ['Variable "', name, '" is not a result of experiment "',
              x.x.displayName, '"'].join('');
          }
        } else {
          // Check outcome list of ALL experiments.
          for(const mx of MODEL.experiments) {
            let xri = mx.resultIndex(name);
            if(xri < 0 && name.indexOf('#') >= 0 &&
               typeof this.context_number === 'number') {
              // Variable name may be parametrized with #, but not in
              // expressions for wildcard selectors.
              name = name.replace('#', this.context_number);
              xri = mx.resultIndex(name);
            }
            if(xri >= 0) {
              // If some match is found, the name specifies a variable.
              x.v = xri;
              break;
            }
          }
        }
        // NOTE: Experiment may still be FALSE, as this will be interpreted
        // as "use current experiment", but run number should be specified.
        if(!msg) {
          if(x.r === false && x.t === false) {
            msg = 'Experiment run not specified';
          } else if(x.v === false) {
            // NOTE: Variable may not be defined as outcome of any experiment.
            // This will be handled at runtime by VMI_push_run_result, but
            // it will be helpful to notify modelers at compile time when an
            // experiment is running, and also when they are editing an
            // expression (so when a modal dialog is showing).
            const
                notice = `No experiments have variable "${name}" as result`,
                tm = UI.topModal;
            // NOTE: Only notify when expression-editing modals are showing.
            if(tm) {
              const mid = tm.id.replace('-modal', '');
              if(['actor', 'note', 'link', 'boundline-data', 'process',
                    'product', 'equation', 'expression'].indexOf(mid) >= 0) {
                UI.notify(notice);
              }
            }
            if(MODEL.running_experiment) {
              // Log message only for block 1.
              VM.logMessage(1, VM.WARNING + notice);
              console.log(`No variable ${name} in expression for:`, this.ownerName);
            }
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
    s = name.split('|');
    if(s.length > 1) {
      // Attribute is string after the LAST separator...
      attr = s.pop().trim();
      // ... so restore `name` in case itself contains other separators.
      name = s.join('|').trim();
      if(!attr) {
        // Explicit *empty* attribute, e.g., [name|]
        // NOTE: This matters for datasets having specifiers: the vertical
        // bar indicates "do not infer a modifier from a running experiment,
        // but use the data".
        use_data = true;
      } else if(attr.startsWith('=')) {
        // Attribute starting with = indicates cluster balance.
        // NOTE: Empty string is considered as "any unit".
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
        pat = pat.slice(1).join('?');
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
      for(const e of ewa) {
        if(patternMatch(e.displayName, pat)) {
          const mnr = matchingWildcardNumber(e.displayName, pat);
          // NOTE: For datasets, pass TRUE to get the modifier expression
          // if `attr` specifies a selector.
          obj = e.attributeValue(attr, true);
          // NOTE: Attribute may be a single value, a vector, or an expression.
          // If neither a single value nor a vector, it must be an expression.
          if(obj === null) obj = e.attributeExpression(attr);
          // Double-check: only add it if it is not NULL.
          // NOTE: It may be zero, so test for NULL!
          if(obj !== null) {
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
    const by_reference = name.startsWith('!');
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

    // NOTE: When parsing the expression of a "method", variables starting
    // with a colon may be special cases.
    if(this.attribute.startsWith(':') && name.startsWith(':')) {
      // When `name` identifies a method ":m" then this method can be
      // called "as is".
      const method = MODEL.equationByID(UI.nameToID(name));
      if(method) {
        // Check for auto-reference.
        if(method.selector === this.attribute) {
          this.error = 'Method cannot reference itself';
          return false;
        }
        if(attr) {
          // Methods are expressions and hence always return a number,
          // not an entity.
          this.error = 'Method cannot have an attribute';
          return false;
        }
        // NOTE: If it has no eligible prefixes yet, the method being
        // parsed "inherits" those of an "as is" method, or should
        // intersect its eligible prefixes with the "inherited" ones.
        method.expression.compile();
        if(method.expression.compiling) {
          this.error = 'Cannot resolve method "' + method.selector +
              '" because this would create a cyclic reference';
          return false;
        }
        const
            ep = {},
            mep = method.expression.eligible_prefixes,
            prefs = Object.keys(mep);
        // NOTE: Prefix keys will always be in lower case.
        for(const pref of prefs) {
          if(this.eligible_prefixes === null || this.eligible_prefixes[pref]) {
            ep[pref] = true;
          }
        }
        this.eligible_prefixes = ep;
        // NOTE: The method may be dynamic and/or level-dependent.
        if(!method.expression.isStatic) {
          this.is_static = false;
          this.log('dynamic because dynamic method is used');
        }
        this.is_level_based = this.is_level_based ||
            method.expression.is_level_based;
        // Generate "call method" VM instruction with no additional
        // arguments; the method equation will be applied to the object
        // of the calling method.
        return [{meq: method}, anchor1, offset1, anchor2, offset2];
      }
      // If `name` does not identify a method, it must match the "tail"
      // of some prefixed entity "prefix: name", because a method can
      // only be used as [prefix: method name] in another expression.
      // When compiling a method, a list of eligible prefixes is made.
      // This should not be empty when a method reference is parsed.
      const
          tail = UI.PREFIXER + name.substring(1).trim(),
          ep = {};
      for(const e of MODEL.entitiesEndingOn(tail, attr)) {
        const
            en = e.displayName,
            pref = en.substring(0, en.length - tail.length).toLowerCase();
        if(this.eligible_prefixes === null || this.eligible_prefixes[pref]) {
          ep[pref] = true;
        }
      }
      this.eligible_prefixes = ep;
      const uca = attr.toUpperCase();
      // Capitalize `attr` if it is a standard entity attribute.
      if(VM.attribute_names[uca]) attr = uca;
      // Add attribute to method attribute list (for post-parsing check).
      this.method_attributes.push(attr);
      if(Object.keys(this.eligible_prefixes).length <= 0) {
        const n = name + (attr ? `|${attr}` : '');
        this.error =
            `No match for variable [${n}] in this method expression`;
        return false;
      }
      // NOTE: Some attributes make the method expression level-dependent.
      this.is_level_based = this.is_level_based ||
         VM.level_based_attr.indexOf(attr) >= 0;
      // NOTE: Simply assume that callin a method makes the expression
      // dynamic.
      this.is_static = false;
      this.log('assumed to be dynamic because method is used');
      // Colon-prefixed variables in method expressions are similar to
      // wildcard variables, so the same VM instruction is coded for,
      // except that the entity that is the object of the method will
      // be set (as `method_object` property) for expressions that "call"
      // the method. The distinction is indicated by passing the string
      // "MO" instead of the list of eligible entities.
      if(this.TRACE) console.log('TRACE: Variable', name,
          'references the method object. Attribute used:', attr);
      return [{n: name, ee: 'MO', a: attr, br: by_reference},
          anchor1, offset1, anchor2, offset2];
    }
    
    // Special "method-parsing" cases will now have been handled.
    // The other cases apply also to normal expressions. 
    if(!obj) {
      // If variable name starts with a colon, then the owner prefix
      // should be added.
      name = UI.colonPrefixedName(name, this.owner_prefix);
      // Now check whether the variable appends a method.
      const
          parts = name.split(UI.PREFIXER),
          tail = parts.pop();
      if(!tail && parts.length) {
        // Prefix without its trailing colon+space could identify an entity.
        obj = MODEL.objectByID(UI.nameToID(parts.join(UI.PREFIXER)));
      } else if(parts.length > 0) {
        // Name contains at least one prefix => last part *could* be a
        // method name, so look it up after adding a leading colon.
        const method = MODEL.equationByID(UI.nameToID(':' + tail));
        // If tail matches with a method, the head must identify an
        // entity.
        if(method) {
          const
              en = parts.join(UI.PREFIXER),
              mep = method.expression.matchWithEligiblePrefixes(en);
          if(!mep) {
            if(method.expression.compiling) {
              this.error = `Cannot resolve "${en}", possibly because ` +
                  `method "${method.selector}" creates a cyclic reference`;
            } else {
              this.error = 'Method "'+ method.selector +
                  `" does not apply to "${en}"`;
            }
            return false;
          }
          // NOTE: The method may be dynamic and/or level-dependent.
          if(!method.expression.isStatic) {
            this.is_static = false;
            this.log('dynamic because dynamic method is used');
          }
          this.is_level_based = this.is_level_based ||
              method.expression.is_level_based;
          // NOTE: `en` may be an incomplete identification of the object
          // of the method, which can be completed only at execution time.
          // For example: [x: m] is a valid method call when "x: a: b"
          // and "x: c" identify model entities, and the expression of
          // method "m" contains variables [:a :b] and [:c] as operands.
          // These operands code as VMI_push_dataset_modifier instructions
          // with specifier {n: name, ee: "MO"} where, for the examples
          // above, "name" would be ":a :b" and ":c". By passing `en`
          // as the "method object prefix" to VMI_push_method, this
          // instruction can set the `method_object_prefix` attribute
          // of the expression so that it can be used by the VMI_push_
          // _dataset_modifier instruction to identify the method object
          // by assembling prefix + name (with its leading colon replaced
          // by the prefixer ": ").
          return [{meq: method, mo: en}, anchor1, offset1, anchor2, offset2];
        }
      }
    }
    if(!obj) {  
      // Now check wildcard equations, as these are likely to be few
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
              const arg0 = (by_reference ?
                  // If equation is "by reference", use VMI_push_entity
                  // while passing the context number as extra parameter.
                  {r: obj.dataset, a: obj.selector, cn: this.context_number} :
                  // Otherwise, use VMI_push_dataset_modifier.
                  {d: obj.dataset, s: this.context_number, x: obj.expression});
              return [arg0, anchor1, offset1, anchor2, offset2];
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
        if(obj.mayBeDynamic) {
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
      if(obj instanceof Dataset && obj.mayBeDynamic) {
        this.is_static = false;
        this.log('dynamic because dataset vector is used');
      } else if(VM.level_based_attr.indexOf(attr) >= 0) {
        this.is_static = false;
        this.log('dynamic because level-based attribute');
      } else if(new Set(arg0).size > 1) {
        // Not all values are equal => dynamic.
        this.is_static = false;
        this.log('Dynamic because array contains different values'); 
        // console.log('ANOMALY: array for', obj.type, obj.displayName, obj, attr, arg0);
        // console.log('Expression for', this.ownerName, '; text =', this.expr);
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
        if(this.TRACE) console.log('TRACE: arg[0] is the expression for',
            arg0.variableName, '\nTRACE: Expression:', arg0.text);
      } else {
        if(this.TRACE) console.log('TRACE: arg[0] not an expression, but', arg0);
      }
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
    // Get the next substring in the expression that is a valid symbol
    // while advancing the position-in-text (`pit`) and length-of-symbol
    // (`los`), which are used to highlight the position of a syntax error
    // in the expression editor.
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
        // NOTE: Enclosing quotes are also part of this symbol.
        this.los = v.length + 2;
        v = UI.cleanName(v);
        if(MODEL.scale_units.hasOwnProperty(v)) {
          // Symbol is a scale unit => use its multiplier as numerical value.
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
      // Check for compound operators (!=, <>, <=, >=, //) and if so, append
      // the second character.
      if(this.pit <= this.eot &&
          COMPOUND_OPERATORS.indexOf(c + this.expr.charAt(this.pit)) >= 0) {
        c += this.expr.charAt(this.pit);
        this.pit++;
      }
      this.los = c.length;
      // Instead of the operator symbol, the corresponding VM instruction
      // should be pushed onto the symbol stack.
      this.sym = OPERATOR_CODES[OPERATORS.indexOf(c)];
    } else {
      // Take any text up to the next operator, parenthesis,
      // opening bracket, quote or space.
      this.los = 0;
      let pl = this.pit + this.los,
          cpl = this.expr.charAt(pl),
          pcpl = '',
          digs = false;
      // NOTE: + and - operators are special case, since they may also
      // be part of a floating point number, hence the more elaborate check.
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
      // ... but trim spaces from the symbol.
      v = this.expr.substring(this.pit, this.pit + this.los).trim();
      // Ignore case.
      l = v.toLowerCase();
      if(l === '#') {
        // # symbolizes the numeric part of a dataset selector, so check
        // whether the expression being parsed is a dataset modifier with
        // a selector that has a numeric wildcard OR whether # can be inferred
        // from the owner.
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
          // If a valid number, keep it within the +/- infinity range.
          this.sym = Math.max(VM.MINUS_INFINITY, Math.min(VM.PLUS_INFINITY, f));
        }
      } else {
        // Symbol does not start with a digit.
        // NOTE: Distinguish between run length N and block length n.
        i = ACTUAL_SYMBOLS.indexOf(l === 'n' ? v : l);
        if(i < 0) {
          if(MODEL.scale_units.hasOwnProperty(v)) {
            // Symbol is a scale unit => use its multiplier as numerical value.
            this.sym = MODEL.scale_units[v].multiplier;
          } else {
            this.error = `Invalid symbol "${v}"`;
          }
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
    // look-ahead 'l', 'random', 'true', 'false', 'pi', 'infinity',
    // 'epsilon' and the context-sensitive number symbol #.
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
        // Similar to above: When a : operator is "coded", the ELSE part
        // has been coded, so the end of the code array is the target for
        // the most recently added JUMP.
        this.code[this.then_stack.pop()][1] = this.code.length;
      }
    } else {
      // All other operations require VM instructions that operate on the
      // expression stack.
      this.code.push([op, null]);
      if(op === VMI_concat) {
        this.concatenating = true;
      } else {
        const randcode = RANDOM_CODES.indexOf(op) >= 0;
        if(REDUCING_CODES.indexOf(op) >= 0) {
          if(randcode && !this.concatenating) {
            // NOTE: Probability distributions MUST have a parameter list but
            // MIN and MAX will also accept a single argument.
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
    // Compile expression into array of VM instructions `code`.
    // NOTE: Always create a new code array instance, as it will typically
    // become the code attribute of an expression object.
    if(DEBUGGING) console.log('COMPILING', this.ownerName, ':\n',
        this.expr, '\ncontext number =', this.context_number);
    this.code = [];
    // Position in text.
    this.pit = 0;
    // Length of symbol.
    this.los = 0;
    // Error message also serves as flag: stop compiling if not empty.
    this.error = '';
    // `is_static` becomes FALSE when a time-dependent operand is detected.
    this.is_static = true;
    // `is_level_based` becomes TRUE when a level-based variable is detected.
    this.is_level_based = false;
    // `concatenating` becomes TRUE when a concatenation operator
    // (semicolon) is pushed, and FALSE when a reducing operator (min, max,
    // normal, weibull, triangular) is pushed.
    this.concatenating = false;
    // An empty expression should return the "undefined" value.
    if(this.expr.trim() === '') {
      this.code.push([VMI_push_number, VM.UNDEFINED]);
      return; 
    }
    // Parse the expression using Edsger Dijkstra's shunting-yard algorithm.
    // vmi = virtual machine instruction (a function).
    let vmi;
    // eot = end of text (index of last character in string).
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
        // Opening parenthesis is ALWAYS pushed onto the stack.
        this.op_stack.push(this.sym);
      } else if(this.sym === ')') {
        // Closing parenthesis => pop all operators until its matching
        // opening parenthesis is found.
        if(this.op_stack.indexOf('(') < 0) {
          this.error = 'Unmatched \')\'';
        } else if(this.prev_sym === '(' ||
          OPERATOR_CODES.indexOf(this.prev_sym) >= 0) {
          // Parenthesis immediately after an operator => missing operand.
          this.error = 'Missing operand';
        } else {
          // Pop all operators up to and including the matching parenthesis.
          vmi = null;
          while(this.op_stack.length > 0 &&
            this.op_stack[this.op_stack.length - 1] !== '(') {
            // Pop the operator.
            vmi = this.op_stack.pop();
            this.codeOperation(vmi);
          }
          // Also pop the opening parenthesis.
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
        // Pop all operators having a higher or equal priority than the
        // one to be pushed EXCEPT when this priority equals 9, as monadic
        // operators bind right-to-left.
        while(this.op_stack.length > 0 && OPERATOR_CODES.indexOf(topop) >= 0 &&
          topprio >= symprio && symprio !== 9) {
          // The stack may be emptied, but if it contains a (, this
          // parenthesis is unmatched.
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
        
        // NOTE: As of version 1.0.14, (a ? b : c) is implemented with
        // "jump"-instructions so that only b OR c is evaluated instead
        // of both.
        if(this.sym === VMI_if_then) {
          // Push index of JUMP-IF-FALSE instruction on if_stack so that
          // later its dummy argument (NULL) can be replaced by the
          // index of the first instruction after the THEN part.
          this.if_stack.push(this.code.length);
          this.code.push([VMI_jump_if_false, null]);
        } else if(this.sym === VMI_if_else) {
          this.then_stack.push(this.code.length);
          this.code.push([VMI_jump, null]);
          // NOTE: If : is not omitted, the code for the ELSE part must
          // start by popping the FALSE result of the IF condition.
          this.code.push([VMI_pop_false, null]);
        }
        // END of new code for IF-THEN-ELSE

        this.op_stack.push(this.sym);
      } else if(this.sym !== null) {
        // Symbol is an operand.
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
          } else if(this.sym[0].hasOwnProperty('meq')) {
            this.code.push([VMI_push_method, this.sym]);
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
      } else if(this.concatenating && !(this.owner instanceof BoundLine)) {
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
    // User name on local machine will be obtained at logon, and will
    // be used as default author name. 
    this.user_name = '';
    // Set user ID to default as configured in file `linny-r-config.js`.
    // This will be an empty string for local host servers.
    this.solver_user = SOLVER.user_id;
    // NOTE: If not empty, then authentication is needed.
    if(this.solver_user) {
      // When Linny-R is hosted on a production server, the user name
      // may be passed as parameter in the URL, so if URL contains ?u=,
      // set user name to the passed parameter.
      let url = decodeURI(window.location.href);
      // NOTE: Trim cache buster suffix that may have been added.
      if(url.indexOf('?x=') > 0) url = url.split('?x=')[0].trim();
      if(url.indexOf('?u=') > 0) {
        this.solver_user = url.split('?u=')[1].trim();
      }
    }
    // NOTE: If not null, the callback function is called when the VM has
    // finished a run. This is used by the console version of Linny-R.
    this.callback = null;
    // Solver limits may be set in file `linny-r-config.js` (0 => unlimited).
    this.max_solver_time = SOLVER.max_solver_time;
    this.max_blocks = SOLVER.max_nr_of_blocks;
    this.max_tableau_size = SOLVER.max_tableau_size;
    // Standard variables: array of tuples [type, object].
    this.variables = [];
    // Indices for special variable types.
    this.int_var_indices = [];
    this.bin_var_indices = [];
    this.sec_var_indices = [];
    this.sos_var_indices = [];
    this.paced_var_indices = [];
    this.fixed_var_indices = [];
    // Chunk variables: also an array of tuples [type, object], but
    // so far, type is always HI (highest increment); object can be
    // a process or a product.
    this.chunk_variables = [];
    // NOTE: As of version 1.8.0, diagnosis is performed only when the
    // modeler Alt-clicks the "run" button or clicks the link in the
    // infoline warning that is displayed when the solver reports that a
    // block poses a problem that is infeasible (too tight constraints)
    // or unbounded (no upper limit on some processes). Diagnosis is
    // implemented by adding slack and setting finite bounds on processes
    // and then make a second attempt to solve the block.
    this.diagnose = false;
    this.prompt_to_diagnose = false;
    // Array for VM instructions.
    this.code = [];
    // The Simplex tableau: matrix, rhs and ct will have same length.
    this.matrix = [];
    this.right_hand_side = [];
    this.constraint_types = [];
    // String to hold lines of (solver-dependent) model equations.
    this.lines = '';
    // String specifying a numeric issue (empty if none).
    this.numeric_issue = '';
    // Warnings are stored in a list to permit browsing through them.
    this.issue_list = [];
    // Bound issues (UB < LB) are recorded to permit compact warnings.
    this.bound_issues = {};
    // The call stack tracks evaluation of "nested" expression variables.
    this.call_stack = [];
    this.block_count = 0;
    // Sequence of round numbers (set by default or as experiment parameter).
    this.round_sequence = '';
    // NOTE: Current round is index in round sequence.
    this.current_round = 0;
    // Add arrays for solver results per block.
    this.round_times = [];
    this.round_secs = [];
    this.solver_times = [];
    this.solver_secs = [];
    this.messages = [];
    this.equations = [];
    
    // Default texts to display for (still) empty results.
    this.no_messages = '(no messages)';
    this.no_variables = '(no variables)';
    this.no_equations = '(select block in progress bar)';

    // Floating-point constants used in calculations
    // Meaningful solver results are assumed to lie wihin reasonable bounds.
    // Extreme absolute values (10^25 and above) are used to signal particular
    // outcomes. This 10^25 limit is used because the original MILP solver
    // used by Linny-R (LP_solve) considers a problem to be unbounded if
    // decision variables reach +INF (1e+30) or -INF (-1e+30), and a solution
    // inaccurate if extreme values get too close to +/-INF. The higher
    // values have been chosen arbitrarily.
    this.SOLVER_PLUS_INFINITY = 1e+25;
    this.SOLVER_MINUS_INFINITY = -1e+25;
    this.BEYOND_PLUS_INFINITY = 1e+35;
    this.BEYOND_MINUS_INFINITY = -1e+35;
    // The VM properties "PLUS_INFINITY" and "MINUS_INFINITY" are used
    // when evaluating expressions. These propeties may be changed for
    // diagnostic purposes -- see below.
    this.PLUS_INFINITY = 1e+25;
    this.MINUS_INFINITY = -1e+25;
    // Expression results having an infinite term may be less than infinity,
    // but still exceptionally high, and this should be shown.
    this.NEAR_PLUS_INFINITY = this.PLUS_INFINITY / 200;
    this.NEAR_MINUS_INFINITY = this.MINUS_INFINITY / 200;
    // As of version 1.8.0, Linny-R imposes no +INF bounds on processes
    // unless diagnosing an unbounded problem. For such diagnosis, the
    // (relatively) low value 9.999999999e+9 is used.
    this.DIAGNOSIS_UPPER_BOUND = 9.999999999e+9;
    // For processes representing grid elements, upper bounds of +INF are
    // "capped" to 9999 grid element capacity units (typically MW for
    // high voltage grids). 
    this.UNLIMITED_POWER_FLOW = 9999;
    // NOTE: Below the "near zero" limit, a number is considered zero
    // (this is to timely detect division-by-zero errors).
    this.NEAR_ZERO = 1e-10;
    // Use a specific constant smaller than near-zero to denote "no cost"
    // to differentiate "no cost" from cost prices that really are 0.
    this.NO_COST = 0.987654321e-10;

    // NOTE: Allow for an accuracy margin: stocks may differ 0.1%  from
    // their target without displaying them in red or blue to signal
    // shortage or surplus.
    this.SIG_DIF_LIMIT = 0.001;
    // Non-zero numbers that with 4-digit accuracy would display as 0
    // are displayed as +0 or -0.
    this.SIG_DIF_FROM_ZERO = 5e-5;
    // ON/OFF threshold is used to differentiate between level = 0 and
    // still "ON" (will be displayed as +0).
    // NOTE: For smaller values than 5e-6, Gurobi will not compute ON/OFF
    // binaries correctly, as it then accepts this low value as a violation
    // constraint.
    this.ON_OFF_THRESHOLD = 5e-6;
    // Limit for upper bounds beyond which binaries cannot be computed
    // correctly. Modeler is warned when this occurs (typically when
    // ON/OFF variables are needed for a process having infinite bounds.
    this.MEGA_UPPER_BOUND = 1e6;
    // Limit slack penalty to one order of magnitude below +INF.
    this.MAX_SLACK_PENALTY = 0.1 * this.PLUS_INFINITY;
    
    // Look-up for VM variable types that are binary.
    this.BINARY_TYPE = {
      IZ: true,
      POS: true,
      NEG: true,
      SU: true,
      SD: true,
      SO: true,
      FC: true,
      SB: true,
      NSCB: true,
      PSCB: true,
      UO1: true,
      DO1: true,
      UO2: true,
      DO2: true,
      UO3: true,
      DO3: true
    };

    // Constraint cost price transfer direction.
    this.SOC_X_Y = 1;
    this.SOC_Y_X = -1;

    // Link multiplier type numbers.
    // NOTE: Do *NOT* change existing values, as this will cause legacy issues!
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
    this.LM_MAX_INCREASE = 12; // Symbol: up-arrow with baseline
    this.LM_MAX_DECREASE = 13; // Symbol: down-arrow with baseline
    this.LM_NEGATIVE = 14; // Symbol: - (minus sign)
    this.LM_CYCLE = 15; // Symbol: cycle arrow
    this.LM_COSTPRICE = 16; // Symbol: cent 

    // List of link multipliers that require binary ON/OFF variables
    this.LM_NEEDING_ON_OFF = [5, 6, 7, 8, 9, 10, 14, 16];
    this.LM_SYMBOLS = ['', '\u21C9', '\u0394', '\u03A3', '\u03BC', '\u25B2',
        '+', '0', '\u2934', '\u2732', '\u25BC', '\u2A39', '\u21A5', '\u21A7',
        '\u2212', '\u27F3', '\u00A2'];
    this.LM_LETTERS = ' TISMU+0RFDP><-C$';
    
    // VM max. expression stack size.
    this.MAX_STACK = 200;

    // Base penalty of 10 is high relative to the (scaled) coefficients of
    // the cash flows in the objective function (typically +/- 1).
    this.BASE_PENALTY = 10;
    // Peak variable penalty is added to make solver choose the *smallest*
    // value that is greater than or equal to X[t] for all t as "peak value".
    // NOTE: The penalty is expressed in the currency unit, so it will be
    // divided by the cash scalar so as not to interfere with the optimal
    // solution (highest total cash flow).
    this.PEAK_VAR_PENALTY = 0.1;
  
    // NOTE: The VM uses numbers >> +INF to denote special computation results.
    this.EXCEPTION = 1e+36; // to test for any exceptional value
    this.UNDEFINED = 1e+37; // to denote "unspecified by the user"
    this.NOT_COMPUTED = 1e+38; // initial value for VM variables (to distinguish from UNDEFINED)
    this.COMPUTING = 1e+39; // used by the VM to implement lazy evaluation
  
    // NOTES:
    // (1) Computation errors are signalled by NEGATIVE values << -10^35.
    // (2) JavaScript exponents can go up to +/- 308 (IEEE 754 standard).
    // (3) when adding/modifying these values, ALSO update the VM methods
    //     for representing these values as human-readable strings!
    
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
    
    // Prefix for warning messages that are logged in the monitor.
    this.WARNING = '-- Warning: ';

    // Solver constants indicating constraint type.
    // NOTE: These correspond to the codes used in the LP format. When
    // generating MPS files, other constants are used.
    this.FR = 0;
    this.LE = 1;
    this.GE = 2;
    this.EQ = 3;
    this.ACTOR_CASH = 4;
    
    this.constraint_codes = ['FR', 'LE', 'GE', 'EQ'];
    this.constraint_symbols = ['', '<=', '>=', '='];
    this.constraint_letters = ['N', 'L', 'G', 'E'];

    // Standard time unit conversion to hours (NOTE: ignore leap years).
    this.time_unit_values = {
      'year': 8760, 'week': 168, 'day': 24,
      'hour': 1, 'minute': 1/60, 'second': 1/3600
    };
    // More or less standard time unit abbreviations.
    // NOTE: Minute is abbreviated to `m` to remain consistent with the
    // constants that can be used in expressions. There, `min` already
    // denotes the "minimum" operator.
    this.time_unit_shorthand = {
      'year': 'yr', 'week': 'wk', 'day': 'd',
      'hour': 'h', 'minute': 'm', 'second': 's'
    };
    // Number of rounds limited to 31 because JavaScript performs bitwise
    // operations on 32 bit integers, and the sign bit may be troublesome.
    this.max_rounds = 31;
    this.round_letters = '?abcdefghijklmnopqrstuvwxyzABCDE';
    // Standard 1-letter codes for Linny-R entities.
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
    // Reverse lookup for entity letter codes.
    this.entity_letter_codes = {
      actor: 'A',
      constraint: 'B',
      cluster: 'C',
      dataset: 'D',
      equation: 'E',
      link: 'L',
      process: 'P',
      product: 'Q'
    };
    this.entity_letters = 'ABCDELPQ';
    // Standard attributes of Linny-R entities.
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
      'MCF': 'marginal cash flow',
      'CI':  'cash in',
      'CO':  'cash out',
      'W':   'weight',
      'R':   'relative rate',
      'D':   'delay',
      'F':   'flow',
      'SOC': 'share of cost',
      'A':   'active'
    };
    // NOTE: Defaults are level (L), link flow (F), cluster cash flow (CF),
    // actor cash flow (CF); dataset value (no attribute).
    // NOTE: Exogenous properties first, then the computed properties.
    this.process_attr = ['LB', 'UB', 'IL', 'LCF', 'L', 'CI', 'CO', 'CF', 'MCF', 'CP'];
    this.product_attr = ['LB', 'UB', 'IL', 'P', 'L', 'CP', 'HCP'];
    this.cluster_attr = ['CI', 'CO', 'CF'];
    this.link_attr = ['R', 'D', 'SOC', 'F'];
    this.constraint_attr = ['SOC', 'A'];
    this.actor_attr = ['W', 'CI', 'CO', 'CF'];
    // Only expression attributes can be used for sensitivity analysis.
    this.expression_attr = ['LB', 'UB', 'IL', 'LCF', 'P', 'R', 'D', 'W'];
    // Attributes per entity type letter.
    this.attribute_codes = {
      A: this.actor_attr,
      B: this.constraint_attr,
      C: this.cluster_attr,
      D: ['V'],  // ("value" -- placeholder, used only by Finder)
      E: ['V'],  // ("value" -- placeholder, used only by Finder)
      L: this.link_attr,
      P: this.process_attr,
      Q: this.product_attr
    };
    this.entity_attribute_names = {};
    for(const el of this.entity_letters) {
      const ac = this.attribute_codes[el];
      this.entity_attribute_names[el] = [];
      for(const a of ac) this.entity_attribute_names[el].push(a);
    }
    // Level-based attributes are computed only AFTER optimization.
    this.level_based_attr = ['L', 'CP',  'HCP', 'CF', 'MCF', 'CI', 'CO', 'F', 'A'];
    this.object_types = ['Process', 'Product', 'Cluster', 'Link', 'Constraint',
        'Actor', 'Dataset', 'Equation'];
    this.type_attributes = [this.process_attr, this.product_attr,
        this.cluster_attr, this.link_attr, this.constraint_attr,
        this.actor_attr, [], []];
    // Statistics that can be calculated for sets of variables.
    this.statistic_operators =
      ['MAX', 'MEAN', 'MIN', 'N', 'SD', 'SUM', 'VAR',
       'MAXNZ', 'MEANNZ', 'MINNZ', 'NNZ', 'SDNZ', 'SUMNZ', 'VARNZ'];
    // Statistics that can be calculated for outcomes and experiment run
    // results.
    this.outcome_statistics =
      ['LAST', 'MAX', 'MEAN', 'MIN', 'N', 'NZ', 'SD', 'SUM', 'VAR'];
    this.solver_names = {
      gurobi: 'Gurobi',
      mosek: 'MOSEK',
      cplex: 'CPLEX',
      scip: 'SCIP',
      lp_solve: 'LP_solve'
    };
  }
  
  selectSolver(id) {
    if(id in this.solver_names) {
      this.solver_id = id;
    } else {
      UI.alert(`Invalid solver ID "${id}"`);
    }
  }
  
  get noSemiContinuous() {
    // Return TRUE if the selected solver does NOT support semi-continuous
    // variables (used to implement "shut down when lower bound constraints"
    // for processes).
    return this.solver_id === 'mosek';
  }

  get noSupportForSOS() {
    // Return TRUE if the selected solver does NOT support special
    // ordered sets (SOS).
    return this.solver_id === 'mosek';
  }

  reset() {
    // Reset the virtual machine so that it can execute the model again.
    // First reset the expression attributes of all model entities.
    MODEL.resetExpressions();
    // Clear slack use information and boundline point coordinates for all
    // constraints.
    for(let k in MODEL.constraints) if(MODEL.constraints.hasOwnProperty(k)) {
      MODEL.constraints[k].reset();
    }
    // Likewise, clear slack use information for all clusters.
    for(let k in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(k)) {
      MODEL.clusters[k].slack_info = {};
    }
    if(MODEL.with_power_flow) {
      POWER_GRID_MANAGER.checkLengths();
    }
    // Clear the expression call stack -- used only for diagnostics.
    this.call_stack.length = 0;
    // The out-of-bounds properties are set when the ARRAY_INDEX error
    // occurs to better inform the modeler.
    this.out_of_bounds_array = '';
    this.out_of_bounds_msg = '';
    MODEL.set_up = false;
    // Let the model know that it should no longer display results in
    // the model diagram. 
    MODEL.solved = false;
    // "block start" is the first time step (relative to start) of the
    // optimization block. 
    this.block_start = 0; 
    // "chunk length" is the number of time steps to solve
    // (block length + look-ahead).
    this.chunk_length = MODEL.block_length + MODEL.look_ahead;
    // Number of blocks is at least 1, and is based on the simulation
    // period  divided by the block length (without look-ahead).
    // NOTES:
    // (1) MODEL.runLength = simulation period + look-ahead, so that
    //     should not be used to compute the number of blocks.
    // (2) For each block, a chunk (block + lookahead) is optimized.
    this.nr_of_time_steps = MODEL.end_period - MODEL.start_period + 1;
    this.nr_of_blocks = Math.ceil(
        this.nr_of_time_steps / MODEL.block_length);

    // EXAMPLE: Simulation period of 55 time steps, block length of 10
    // time steps and no look-ahead => 6 chunks, and chunk length = block
    // length = 10. If look-ahead = 8, then STILL 6 blocks, but now the
    // *chunks* have 18 time steps, with the 5th *chunk* covering
    // t=41 - t=58. This is already beyond the end of the simulation period
    // (t=55), but with insufficient look-ahead (3), hence the 6th block
    // covering t=51 through t=68, of which only the first five time step
    // results will be used.

    // Initialize error counters (error count will be reset to 0 for each
    // block).
    this.error_count = 0;
    this.block_issues = 0;
    // Clear bound issue dictionary.
    this.bound_issues = {};
    // Clear issue list with warnings and hide issue panel.
    this.issue_list.length = 0;
    this.issue_index = -1;
    UI.updateIssuePanel();
    // Special tracking of potential solver license errors.
    this.license_expired = 0;
    // Variables that will be decided by the solver again in the next
    // block must be "fixated" when, due to a negative link delay, they
    // would have consequences for the previous block (and these will be
    // ignored).
    this.variables_to_fixate = {};
    // Reset solver result arrays.
    this.round_times.length = 0;
    this.solver_times.length = 0;
    this.round_secs.length = 0;
    this.solver_secs.length = 0;
    this.messages.length = 0;
    this.equations.length = 0;
    // Initialize arrays to the expected number of blocks so that values
    // can be stored asynchronously.
    for(let i = 0; i < this.nr_of_blocks; i++) {
      this.solver_times.push(0);
      this.messages.push(this.no_messages);
      this.equations.push(this.no_equations);
    }
    // Reset the (graphical) controller.
    MONITOR.reset();
    // Solver license expiry date will be set to ['YYYYMMDD'], or to []
    // if none.
    this.license_expires = [];
    this.block_count = 1;
    // Use default round sequence unless it has been set.
    if(MODEL.round_sequence === '') {
      this.round_sequence = this.round_letters.slice(1, MODEL.rounds + 1); 
    } else {
      this.round_sequence = MODEL.round_sequence;
    }
    this.current_round = 0;
    // Set the current time step, *relative* to the start of the simulation
    // period (i.e., t = 0 corresponds with the "from" time step t_0).
    this.t = 0;
    // Prepare for halt.
    this.halted = false;
    // Flag to indicate that VM is executing its tableau construction code.
    // This affects how chunk time (ct) is computed, and whether expression
    // results must be recomputed (see inLookAhead below).
    this.executing_tableau_code = false;
    UI.readyToSolve();
  }
  
  noNearZero(r) {
    // Return 0 when `r` is (near) zero, and otherwise `r`.
    if(Math.abs(r) <= this.NEAR_ZERO) return 0;
    return r;
  }
  
  inLookAhead(t) {
    // Return TRUE if VM is executing its tableau construction code AND
    // time step `t` falls in the look-ahead period of the previous block.
    return this.executing_tableau_code &&
        t - (this.block_count - 1) * MODEL.block_length <= MODEL.look_ahead;
  }

  errorMessage(n) {
    // VM errors are very big NEGATIVE numbers, so start comparing `n`
    // with the most negative one to return the correct message.
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
    // Large positive values denote exceptions.
    if(n >= this.COMPUTING) return 'Cyclic reference while computing';
    if(n >= this.NOT_COMPUTED) return 'Variable or expression not computed';
    if(n >= this.UNDEFINED) return 'Undefined variable or expression';
    if(n === undefined) return 'Undefined Javascript value';
    return n;
  }
  
  specialValue(n) {
    // Return [FALSE, n] if number n is a NOT a special value,
    // otherwise [TRUE, string] with string a readable representation
    // of Virtual Machine error values and other special values.
    // VM errors are very big NEGATIVE numbers, so start comparing `n`
    // with the most negative error code.
    if(n <= this.UNKNOWN_ERROR) return [true, '#ERROR?'];
    if(n <= this.PARAMS) return [true, '#PARAMS'];
    if(n <= this.INVALID) return [true, '#INVALID'];
    if(n <= this.OVERFLOW) return [true, '#STACK+'];
    if(n <= this.UNDERFLOW) return [true, '#STACK-'];
    if(n <= this.BAD_REF) return [true, '#REF?'];
    if(n <= this.ARRAY_INDEX) return [true, '#INDEX!'];
    if(n <= this.BAD_CALC) return [true, '#VALUE!'];
    if(n <= this.DIV_ZERO) return [true, '#DIV/0!'];
    if(n <= this.CYCLIC) return [true, '#CYCLE!'];
    // Any other number less than or equal to 10^30 is considered as
    // minus infinity.
    if(n <= this.NEAR_MINUS_INFINITY) return [true, '-\u221E'];
    // Other special values are very big POSITIVE numbers, so start
    // comparing `n` with the highest value.
    if(n >= this.COMPUTING) return [true, '\u25A6']; // Checkered square
    // NOTE: The prettier circled bold X 2BBF does not display on macOS !!
    if(n >= this.NOT_COMPUTED) return [true, '\u2297']; // Circled X
    if(n >= this.UNDEFINED) return [true, '\u2047']; // Double question mark ??
    if(n >= this.NEAR_PLUS_INFINITY) return [true, '\u221E'];
    if(n === this.NO_COST) return [true, '\u00A2']; // c-slash (cent symbol)
    return [false, n];
  }
  
  sig2Dig(n) {
    // Return number `n` formatted so as to show 2-3 significant digits
    // NOTE: as `n` should be a number, a warning sign will typically
    // indicate a bug in the software.
    if(typeof n === 'string') n = parseFloat(n);
    if(n === undefined || isNaN(n)) return '\u26A0'; // Warning sign
    const sv = this.specialValue(n);
    // If `n` has a special value, return its representation.
    if(sv[0]) return sv[1];
    const a = Math.abs(n);
    // Signal small differences from true 0 by leading + or - sign.
    if(n !== 0 && a <= this.ON_OFF_THRESHOLD) return n > 0 ? '+0' : '-0';
/* 
    if(a >= 9999.5) return n.toPrecision(2);
    if(Math.abs(a-Math.round(a)) < 0.05) return Math.round(n);
    if(a < 1) return Math.round(n*100) / 100;
    if(a < 10) return Math.round(n*10) / 10;
    if(a < 100) return Math.round(n*10) / 10;
    return Math.round(n);
*/
    let s = n.toString();
    const
        prec = n.toPrecision(2),
        precf = parseFloat(prec),
        rn = Math.round(n);
    // Prevent cases like 1001 becoming "1.0e+3".
    if(Math.abs(precf - n) >= Math.abs(rn - n)) s = rn.toString();
    if(prec.length < s.length) s = prec;
    const expo = n.toExponential(1);
    if(expo.length < s.length) s = expo;
    return s;
  }
  
  sig4Dig(n, tiny=false) {
    // Return number `n` formatted so as to show 4-5 significant digits.
    // NOTE: As `n` should be a number, a warning sign will typically
    // indicate a bug in the software.
    if(typeof n === 'string') n = parseFloat(n);
    if(n === undefined || isNaN(n)) return '\u26A0';
    const sv = this.specialValue(n); 
    // If `n` has a special value, return its representation.
    if(sv[0]) return sv[1];
    const a = Math.abs(n);
    if(a === 0) return 0;
    // Signal small differences from exactly 0 by a leading + or - sign
    // except when the `tiny` flag is set.
    if(a <= this.ON_OFF_THRESHOLD && !tiny) return n > 0 ? '+0' : '-0';
/*
    if(a >= 9999.5) return n.toPrecision(4);
    if(Math.abs(a-Math.round(a)) < 0.0005) return Math.round(n);
    if(a < 1) return Math.round(n*10000) / 10000;
    if(a < 10) return Math.round(n*1000) / 1000;
    if(a < 100) return Math.round(n*100) / 100;
    if(a < 1000) return Math.round(n*10) / 10;
    return Math.round(n);
*/
    let s = n.toString();
    const
        prec = n.toPrecision(4),
        precf = parseFloat(prec),
        rn = Math.round(n);
    // Prevent cases like 100001 becoming "1.00e+5".
    if(Math.abs(precf - n) >= Math.abs(rn - n)) s = rn.toString();
    if(prec.length < s.length) s = prec;
    const expo = n.toExponential(2);
    if(expo.length < s.length) s = expo;
    if(s.indexOf('e') < 0) s = parseFloat(s).toString();
    return s;
  }
  
  //
  // Vector scaling methods for datasets and experiment run results.
  //
  
  keepException(test, result) {
    // Return result only when test is *not* an exceptional value.
    if(test >= VM.MINUS_INFINITY && test <= VM.PLUS_INFINITY) {
      // Apply the NON_ZERO threshold.
      if(Math.abs(result) <= VM.NEAR_ZERO) return 0;
      return result;
    }
    // Otherwise, return the exceptional value.
    return test;
  }
  
  scaleDataToVector(data, vector, ddt, vdt, vl=0, start=1, fill=VM.UNDEFINED,
      periodic=false, method='nearest') {
    // Convert array `data` with time step duration `ddt` to a vector with
    // time step duration `vdt` with length `vl`, assuming that data[0]
    // corresponds to vector[start] using the specified method, and filling out
    // with `fill` unless `periodic` is TRUE.
    // NOTE: Do nothing if vector or data are not arrays.
    if(!(Array.isArray(vector) && Array.isArray(data))) return;
    // Initialize the vector.
    vector.length = vl + 1;
    vector.fill(fill);
    const dl = data.length;
    // No data? Then return the vector with its `fill` values.
    if(!dl) return;
    // Also compute the array lengths for data and model.
    // NOTE: Times are on "real" time scale, counting from t=1 onwards.
    let period_length = dl * ddt, // no data beyond this time unless periodic
        t_end = (start + vl) * vdt, // last time needing data for simulation
        n = vl; // number of elements to calculate (by default: vector length)
    if(!periodic) {
      // If dataset is not periodic and ends before the vector's end time,
      // compute the vector only to the dataset end time.
      if(t_end > period_length) {
        t_end = period_length;
        // This then means fewer vector time steps to compute the vector for.
        n = Math.floor((t_end - start) / vdt) + 1;
      }
    }
    // NOTE: `vts` (vector time step), and `dts` (data time step) are
    // indices in the respective arrays.
    let dts = 1,
        vts = 1;
    // The "use nearest corresponding data point" does not aggregate.
    if(method === 'nearest') {
      // NOTE: data[0] by definition corresponds to vector time t=1,
      // whereas vector[0] must contain the initial value (start - 1).
      // NOTE: t is time (*unrounded* step) at VECTOR time scale.
      // For "nearest", start with data that corresponds to just below
      // half a vector time step before the first time step on the VECTOR
      // time scale.
      let t = (start - 0.501) * vdt;
      // t_end += 0.499 * vdt;
      // NOTE: Always modulo data length to anticipate periodic. For the
      // algorithm used for NEAREST, this works also if *not* periodic.
      dts = (Math.floor(t / ddt)) % dl;  
  /*
  console.log(method, start, t, t_end, 'ddt vdt', ddt, vdt, 'dts vts vl',
              dts, vts, vl, 'DATA', data.toString(), 'V', vector.toString());
  */
      // NOTE: For vector[0], use one data time step earlier.
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
          // NOTE: Remaining part (1 - vtf) may be shorter than 1 dts.
          v = this.keepException(data[dts], v + data[dts] * Math.min(dtf, 1 - vtf));
          vtf += dtf;
          // Store the last data step as "previous step" for later use.
          ps = dts;
          dts = (dts + 1) % dl;
          n_dts++;
          // NOW take the maximum, as new dts still pertains to this vts.
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
    // Return the last round number in the round sequence.
    const index = this.round_sequence.length - 1;
    if(index < 0) return '';
    return this.round_sequence[index];
  }
  
  get supRound() {
    // Return HTML for the current round letter as a superscript.
    // NOTE: Do not show round number as superscript of the step number
    // if the only round in the sequence is round a.
    if(MODEL.rounds < 1 || this.round_sequence === 'a') {
      return '';
    } else {
      return '<sup style="font-size: 8pt; font-style: italic">' +
        this.round_sequence[this.current_round] + '</sup>';
    }
  }
  
  get blockWithRound() {
    // Return block number plus round letter as plain text string.
    // NOTE: No round letter if no rounds, or only one round a.
    if(MODEL.rounds < 1 || this.round_sequence === 'a') {
      return this.block_count;
    } else {
      return this.block_count + this.round_sequence[this.current_round];
    }
  }
  
  logCallStack(t) {
    // Similar to showCallStack, but simpler, and output only to console.
    console.log('Call stack:', this.call_stack.slice());
    const csl = this.call_stack.length;
    console.log(`ERROR at t=${t}: ` +
        this.errorMessage(this.call_stack[csl - 1].vector[t]));
    // Make separate lists of variable names and their expressions.
    const
        vlist = [],
        xlist = [];
    for(const x of this.call_stack) {
      // For equations, only show the attribute.
      const ons = (x.object === MODEL.equations_dataset ?
          (x.attribute.startsWith(':') ? x.method_object_prefix : '') :
              x.object.displayName + '|');
      vlist.push(ons + x.attribute);
      // Trim spaces around all object-attribute separators in the
      // expression as entered by the modeler.
      xlist.push(x.text.replace(/\s*\|\s*/g, '|'));
    }
    // Start without indentation.
    let pad = '';
    // First log the variable being computed.
    console.log('Computing:', vlist[0]);
    // Then iterate upwards over the call stack.
    for(let i = 0; i < vlist.length - 1; i++) {
      // Log the expression, followed by the next computed variable.
      console.log(pad + xlist[i] + '\u279C' + vlist[i + 1]);
      // Increase indentation.
      pad += '   ';
    }
    // Log the last expression.
    console.log(pad + xlist[xlist.length - 1]);
  }

  logTrace(trc) {
    // Log the trace string to the browser console when debugging.
    if(DEBUGGING) console.log(trc);
  }

  logMessage(block, msg) {
    // Add a solver message to the list.
    // NOTE: block number minus 1, as array is zero-based.
    if(this.messages[block - 1] === this.no_messages) {
      this.messages[block - 1] = '';
    }
    this.messages[block - 1] += msg + '\n';
    if(msg.startsWith(this.WARNING)) {
      this.error_count++;
      this.issue_list.push(msg);
    }
    // Show message on console or in Monitor dialog.
    MONITOR.logMessage(block, msg);
  }
  
  setRunMessages(n) {
    // Set the messages and solver times for experiment or SA run `n`.
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
      for(const bm of r.block_messages) {
        const err = (bm.messages.indexOf('Solver status = 0') < 0 ||
            bm.messages.indexOf(this.WARNING) >= 0);
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
    // Record time of this timer reset.
    this.reset_time = new Date().getTime();
    this.time_stamp = this.reset_time;
    // Activate the timer.
    this.timer_id = setInterval(() => MONITOR.updateMonitorTime(), 1000);
  }

  stopTimer() {
    // Deactivate the timer.
    clearInterval(this.timer_id);
  }

  get elapsedTime() {
    // Return seconds since previous "elapsed time" check.
    const ts = this.time_stamp;
    this.time_stamp = new Date().getTime();
    return (this.time_stamp - ts) / 1000;
  }
  
  addVariable(type, obj) {
    // Add a variable that will need a column in the Simplex tableau.
    // NOTE: `index` is 1-based, so when looking up a variable in the
    // VM variables list, the variable looked for is variables[index - 1]. 
    const index = this.variables.push([type, obj]);
    if(((type === 'PL' || type === 'PiL') && obj.level_to_zero) ||
       (type === 'NSC' || type === 'PSC')) {
      this.sec_var_indices[index] = true;
    }
    if(type === 'I' || type === 'PiL') {
      this.int_var_indices[index] = true;
    } else if(VM.BINARY_TYPE[type]) {
      this.bin_var_indices[index] = true;
    }
    if(obj instanceof Process && obj.pace > 1) {
      // NOTE: Binary variables can be "paced" just like level variables.
      this.paced_var_indices[index] = obj.pace;
    }
    // For constraint bound lines, add as many SOS variables as there
    // are points on the bound line.
    if(type === 'W1' && obj instanceof BoundLine) {
      const n = obj.maxPoints;
      for(let i = 2; i <= n; i++) {
        this.variables.push(['W' + i, obj]);
      }
      // NOTE: SOS constraints are not needed when a bound line defines
      // a convex feasible area.
      if(!obj.needsNoSOS) {
        this.sos_var_indices.push([index, n]);
        // NOTE: Some solvers do not support SOS. To ensure that only 2
        // adjacent w[i]-variables are non-zero (they range from 0 to 1),
        // as many binary variables b[i] must be defined, and additional
        // constraints must be added (see VMI_add_bound_line_constraint).
        if(this.noSupportForSOS) {
          for(let i = 1; i <= n; i++) {
            const bi = this.variables.push(['b' + i, obj]);
            this.bin_var_indices[bi] = true;
          }        
        }
      }
    }
    return index;
  }
  
  gridProcessVarIndices(p, offset=0) {
    // Return an object with lists of 1, 2 or 3 slope variable indices.
    if(p.up_1_var_index <= 0) return null;
    const gpv = {
        slopes: 1,
        up: [p.up_1_var_index + offset],
        up_on: [p.up_1_on_var_index + offset],
        down: [p.down_1_var_index + offset],
        down_on: [p.down_1_on_var_index + offset]
    };
    if(p.up_2_var_index >= 0) {
      gpv.slopes++;
      gpv.up.push(p.up_2_var_index + offset);
      gpv.up_on.push(p.up_2_on_var_index + offset);
      gpv.down.push(p.down_2_var_index + offset);
      gpv.down_on.push(p.down_2_on_var_index + offset);
      if(p.up_3_var_index >= 0) {
        gpv.slopes++;
        gpv.up.push(p.up_3_var_index + offset);
        gpv.up_on.push(p.up_3_on_var_index + offset);
        gpv.down.push(p.down_3_var_index + offset);
        gpv.down_on.push(p.down_3_on_var_index + offset);
      }
    }
    return gpv;
  }

  resetVariableIndices(p) {
    // Set all variable indices to -1 ("no such variable") for node `p`.
    p.level_var_index = -1;
    // Three binaries as +/0/- indicators.
    p.plus_var_index = -1;
    p.is_zero_var_index = -1;
    p.minus_var_index = -1;
    // Two continuous for "epsilon" levels.
    p.pep_var_index = -1;
    p.nep_var_index = -1;
    // Two semi-continuous for "ON" levels.
    p.psc_var_index = -1;
    p.nsc_var_index = -1;
    // Two binaries used only when solver does not support
    // semi-continuous variables.
    p.pscb_var_index = -1;
    p.nscb_var_index = -1;
    // More variables to compute special link multipliers.
    p.start_up_var_index = -1;
    p.shut_down_var_index = -1;
    p.start_up_count_var_index = -1;
    p.suc_on_var_index = -1;
    p.first_commit_var_index = -1;
    p.peak_inc_var_index = -1;
    if(p instanceof Product) {
      // Only products can have slack variables.
      p.stock_LE_slack_var_index = -1;
      p.stock_GE_slack_var_index = -1;
    } else {
      // Only processes can be semi-continuous or grid elements.
      p.semic_var_index = -1;
      // Additional indices for grid elements.
      p.up_1_var_index = -1;
      p.up_1_on_var_index = -1;
      p.down_1_var_index = -1;
      p.down_1_on_var_index = -1;
      p.up_2_var_index = -1;
      p.up_2_on_var_index = -1;
      p.down_2_var_index = -1;
      p.down_2_on_var_index = -1;
      p.up_3_var_index = -1;
      p.up_3_on_var_index = -1;
      p.down_3_var_index = -1;
      p.down_3_on_var_index = -1;
    }
  }
  
  addNodeVariables(p) {
    // Add tableau variables for process or product `p`.
    // NOTE: Every node (process or product) is represented by at least
    // one variable: its "level". This is done even if a product has no
    // storage capacity, because it simplifies the formulation of
    // product-related (data) constraints.
    p.level_var_index = this.addVariable(p.integer_level ? 'PiL': 'PL', p);
    if(p.level_to_zero && this.noSemiContinuous) {
      // When the selected solver does not support semi-continous variables,
      // they must be implemented with an additional binary variable.
      p.semic_var_index = this.addVariable('SB', p);
    }
    // Some "data-only" link multipliers require additional variables.
    // NOTE: As of version 2.0, power grid processes also need ON/OFF.
    const nood = p.needsOnOffData;
    if(nood || p.grid) {
      // When ON/OFF is relevant, add 3 binary variables as explained
      // some 1100 lines below (around line 4250)...
      p.plus_var_index = this.addVariable('POS', p);
      p.is_zero_var_index = this.addVariable('IZ', p);
      p.minus_var_index = this.addVariable('NEG', p);
      // ... and also add the level partitioning variables.
      p.pep_var_index = this.addVariable('PEP', p);
      p.nep_var_index = this.addVariable('NEP', p);
      p.psc_var_index = this.addVariable('PSC', p);
      p.nsc_var_index = this.addVariable('NSC', p);
      if(this.noSemiContinuous) {
        p.pscb_var_index = this.addVariable('PSCB', p);
        p.nscb_var_index = this.addVariable('NSCB', p);
      }
      // To detect startup, one more variable is needed
      if(p.needsStartUpData) {
        p.start_up_var_index = this.addVariable('SU', p);
        // To detect first commit, three more variables are needed
        if(p.needsFirstCommitData) {
          // NOTE: First commit is trivial (always 0) when `p` has a non-zero
          // level at t=0.
          if(p.actualLevel(0)) {
            UI.warn(`${p.type} <strong>${p.displayName}</strong> is already committed at t=0`);
          } else {
            p.start_up_count_var_index = this.addVariable('SC', p);
            p.suc_on_var_index = this.addVariable('SO', p);
            p.first_commit_var_index = this.addVariable('FC', p);
          }
        }
      }
      // To detect shut-down, one more variable is needed
      if(p.needsShutDownData) {
        p.shut_down_var_index = this.addVariable('SD', p);
      }
    }
    if(p.grid) {
      // Processes representing power grid elements are bi-directional
      // and hence need separate UP and DOWN flow variables.
      p.up_1_var_index = this.addVariable('U1', p);
      p.up_1_on_var_index = this.addVariable('UO1', p);
      p.down_1_var_index = this.addVariable('D1', p);
      p.down_1_on_var_index = this.addVariable('DO1', p);
      // Additional UP and DOWN is needed for each additional loss slope.
      if(p.grid.loss_approximation > 1) {
        p.up_2_var_index = this.addVariable('U2', p);
        p.up_2_on_var_index = this.addVariable('UO2', p);
        p.down_2_var_index = this.addVariable('D2', p);
        p.down_2_on_var_index = this.addVariable('DO2', p);
        if(p.grid.loss_approximation > 2) {
          p.up_3_var_index = this.addVariable('U3', p);
          p.up_3_on_var_index = this.addVariable('UO3', p);
          p.down_3_var_index = this.addVariable('D3', p);
          p.down_3_on_var_index = this.addVariable('DO3', p);
        }
      }
    }
    // NOTES:
    // (1) Processes have NO slack variables, because sufficient slack is
    //     provided by adding slack variables to products; these slack
    //     variables will have high cost penalty values in the objective
    //     function, to serve as "last resort" to still obtain a solution
    //     when the "real" product levels are overconstrained
    // (2) The modeler may selectively disable slack to force the solver
    //     to respect certain constraints. This may result in infeasible
    //     MILP problems. The solver will report this, but provide no
    //     clue as to which constraints may be critical.
    if(p instanceof Product && this.diagnose && !p.no_slack) {
      p.stock_LE_slack_var_index = this.addVariable('LE', p);
      p.stock_GE_slack_var_index = this.addVariable('GE', p);
    }
  }

  priorValue(tuple, t) {
    // Return the value of a tableau variable calculated for a prior block.
    // NOTE: `tuple` is a [type, object] VM variable specification. 
    const
        type = tuple[0],
        obj = tuple[1];
    if(type.indexOf('-peak') > 0) {
      // Peak level variables have an array as node property.
      const c = Math.trunc(t / this.block_length);
      if(type.startsWith('b')) return obj.b_peak_inc[c];
      return obj.la_peak_inc[c];
    }
    const prior_level = obj.actualLevel(t);
    if(type === 'POS') return prior_level > 0 ? 1 : 0;
    if(type === 'IZ') return prior_level === 0 ? 1 : 0;
    if(type === 'NEG') return prior_level < 0 ? 1 : 0;
    // Start-up at time t entails that t is in the list of start-up
    // time steps.
    if(type === 'SU') return obj.start_ups.indexOf(t) < 0 ? 0 : 1;
    // Shut-down at time t entails that t is in the list of shut-down
    // time steps.
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

  variablesLegend() {
    // Return a string with each variable code and full name on a
    // separate line.
    // Meanwhile, construct "dictionary" for variables.
    this.variables_dictionary = {};
    const
        vcnt = this.variables.length,
        z = vcnt.toString().length,
        dict_z = this.columnsInBlock.toString().length;
    if(vcnt == 0) return '(no variables)';
    let l = '';
    for(let i = 0; i < vcnt; i++) {
      const
          obj = this.variables[i][1],
          x = 'X' + (i+1).toString().padStart(z, '0'),
          p = (obj instanceof Process && obj.pace > 1 ? ' 1/' + obj.pace : ''),
          v = obj.displayName  + ' [' + this.variables[i][0] + p + ']';
      l += `${x} ${v}\n`;
      this.variables_dictionary['X' + (i+1).toString().padStart(dict_z, '0')] = v;
    }
    if(this.chunk_variables.length > 0) {
      const chof = this.cols * this.chunk_length + 1;
      for(let i = 0; i < this.chunk_variables.length; i++) {
        const
            obj = this.chunk_variables[i][1],
            // NOTE: Chunk offset takes into account that variable
            // indices are 0-based.
            cvi = chof + i,
            x = 'X' + cvi.toString().padStart(z, '0'),
            v = obj.displayName + ' [' + this.chunk_variables[i][0] + ']';      
        l += `${x}${'     '.slice(x.length)}${v}\n`;
        this.variables_dictionary[x] = v;
      }
    }
    return l;
  }
  
  setProductBoundConstraints(p) {
    // Set LB and UB constraints for product `p`.
    // NOTE: This method affects the VM coefficient vector, so this vector
    // should be saved (using a VM instruction) if it is needed later.
    const
        vi = p.level_var_index,
        lesvi = p.stock_LE_slack_var_index,
        gesvi = p.stock_GE_slack_var_index,
        notsrc = !p.isSourceNode,
        notsnk = !p.isSinkNode;
    this.code.push(
      // Set coefficients vector to 0.
      [VMI_clear_coefficients, null],
      // Always add the index of the variable-to-be-constrained.
      [VMI_add_const_to_coefficient, [vi, 1]]
    );
    // Get the lower bound as number (static LB) or expression (dynamic LB).
    // NOTE: By default, LB = 0 and UB = +INF.
    let l = 0,
        u = VM.PLUS_INFINITY;
    if(p.hasBounds) {
      if(p.lower_bound.defined) {
        if(p.lower_bound.isStatic) {
          l = p.lower_bound.result(0);
        } else {
          l = p.lower_bound;
        }
      }
      // Likewise get the upper bound.
      if(p.equal_bounds && p.lower_bound.defined) {
        u = l;
      } else if(p.upper_bound.defined) {
        if(p.upper_bound.isStatic) {
          u = p.upper_bound.result(0);
        } else {
          u = p.upper_bound;
        }
      }
    } else {
      // Implicit bounds: if not a source, then LB is set to 0.
      if(notsrc) l = 0;
      // If not a sink, UB is set to 0.
      if(notsnk) u = 0;
    }
    
    // NOTE: Stock constraints must take into account extra inflows
    // (source) or outflows (sink).
    // Check for special case of equal bounds, as then one EQ constraint
    // suffices. This applies if P is a constant ...
    if(p.isConstant) {
      // NOTE: No slack on constants. Use the lower bound (number or
      // expression) as RHS.
      this.code.push(
        [l instanceof Expression ? VMI_set_var_rhs : VMI_set_const_rhs, l],
        [VMI_add_constraint, VM.EQ]
      );
    // ... or if P is neither source nor sink.
    } else if(p.equal_bounds && notsrc && notsnk) {
      if(this.diagnose && !p.no_slack) {
        // NOTE: For EQ, both slack variables should be used, having
        // respectively -1 and +1 as coefficients.
        this.code.push(
          [VMI_add_const_to_coefficient, [lesvi, -1]],
          [VMI_add_const_to_coefficient, [gesvi, 1]]
        );
      }
      // Use the lower bound (number or expression) as RHS.
      this.code.push(
        [l instanceof Expression ? VMI_set_var_rhs : VMI_set_const_rhs, l],
        [VMI_add_constraint, VM.EQ]
      );
    } else {
      // Add lower bound (GE) constraint unless product is a source node.
      if(notsrc) {
        if(this.diagnose && !p.no_slack) {
          // Add the GE slack index with coefficient +1 (so it can
          // INcrease the left-hand side of the equation)
          this.code.push([VMI_add_const_to_coefficient, [gesvi, 1]]);
        }
        // Use the lower bound (number or expression) as RHS.
        this.code.push(
          [l instanceof Expression? VMI_set_var_rhs : VMI_set_const_rhs, l],
          [VMI_add_constraint, VM.GE]
        );          
      }
      // Add upper bound (LE) constraint unless product is a sink node
      if(notsnk) {
        if(this.diagnose && !p.no_slack) {
          // Add the stock LE index with coefficient -1 (so it can
          // DEcrease the LHS).
          this.code.push([VMI_add_const_to_coefficient, [lesvi, -1]]);
        }
        // Use the upper bound (number or expression) as RHS.
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
    
    // Reset variable arrays and code array.
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
    // Initialize fixed variable array: 1 list per round.
    for(let i = 0; i < MODEL.rounds; i++) this.fixed_var_indices.push([]);
    
    // Log if run is performed in "diagnosis" mode.
    if(this.diagnose) {
      this.logMessage(1, 'DIAGNOSTIC RUN' +
          (MODEL.always_diagnose ? ' (default -- see model settings)': '') +
          '\n- slack variables on products and constraints' +
          '\n- finite bounds on all processes');
    }
    
    // Just in case: re-determine which entities can be ignored.
    MODEL.inferIgnoredEntities();
    const n = Object.keys(MODEL.ignored_entities).length;
    if(n > 0) {
      this.logMessage(1,
          pluralS(n, 'entity', 'entities') + ' will be ignored');
    }

    // Infer cycle basis for combined power grids for which Kirchhoff's
    // voltage law must be enforced.
    if(MODEL.with_power_flow) {
      this.logMessage(1, 'POWER FLOW: ' +
          pluralS(Object.keys(MODEL.power_grids).length, 'grid'));
      if(MODEL.ignore_grid_capacity) this.logMessage(1,
          'NOTE: Assuming infinite grid line capacity');
      if(MODEL.ignore_KVL) this.logMessage(1,
          'NOTE: Disregarding Kirchhoff\'s Voltage Law');
      if(MODEL.ignore_power_losses) this.logMessage(1,
          'NOTE: Disregarding transmission losses');
      POWER_GRID_MANAGER.inferCycleBasis();
      if(POWER_GRID_MANAGER.messages.length > 1) {
        UI.warn('Check monitor for power grid warnings');
      }
      this.logMessage(1, POWER_GRID_MANAGER.messages.join('\n'));
      if(POWER_GRID_MANAGER.cycle_basis.length) this.logMessage(1,
          'Enforcing Kirchhoff\'s voltage law for ' +
          POWER_GRID_MANAGER.cycleBasisAsString);
    }

    // FIRST: Define indices for all variables (index = Simplex tableau
    // column number).

    // Each actor has a variable to compute its cash in and its cash out.
    const actor_keys = Object.keys(MODEL.actors).sort();
    for(const k of actor_keys) {
      const a = MODEL.actors[k];
      a.cash_in_var_index = this.addVariable('CI', a);
      a.cash_out_var_index = this.addVariable('CO', a);
    }
    // Define variable indices for all processes.
    const process_keys = Object.keys(MODEL.processes).sort();
    for(const k of process_keys) {
      const p = MODEL.processes[k];
      this.resetVariableIndices(p);
      if(!MODEL.ignored_entities[k]) this.addNodeVariables(p);
    }
    // Do likewise for all products.
    const product_keys = Object.keys(MODEL.products).sort();
    for(const k of product_keys) {
      const p = MODEL.products[k];
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
    // NOTE: Slack variables are omitted when the "no slack" property
    // of the constraint is set.
    const constraint_keys = Object.keys(MODEL.constraints).sort();
    for(const k of constraint_keys) if(!MODEL.ignored_entities[k]) {
      const c = MODEL.constraints[k];
      for(const bl of c.bound_lines) {
        bl.sos_var_indices = [];
        if(bl.constrainsY) {
          // Define SOS2 variables w[i] (plus associated binaries if
          // solver does not support special ordered sets).
          // NOTE: `addVariable` will add as many as there are points!
          bl.first_sos_var_index = this.addVariable('W1', bl);
          if(this.diagnose && !c.no_slack) {
            // Define the slack variable(s) for bound line constraints.
            // NOTE: Category [2] means: highest slack penalty.
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
    
    // Now all variables that get a tableau column in each time step have
    // been defined; next step is to add "chunk variables".
    let cvi = 0;
    // Add *two* chunk variables for processes having a peak increase link.
    for(const k of process_keys) if(!MODEL.ignored_entities[k]) {
      const p = MODEL.processes[k];
      if(p.needsMaximumData) {
        // First variable: "peak increase" for block.
        // NOTE: Peak increase index starts at 0 and relates to the
        // chunk variables list, not the tableau columns.
        p.peak_inc_var_index = cvi;
        this.chunk_variables.push(['b-peak', p]);
        cvi++;
        // Additional "peak increase" for the look-ahead period.
        // NOTE: No need to record the second index as it wil allways be
        // equal to block peak index + 1.
        this.chunk_variables.push(['la-peak', p]);
        cvi++;
      }
    }
    // Do likewise for such products.
    for(const k of product_keys) if(!MODEL.ignored_entities[k]) {
      const p = MODEL.products[k];
      if(p.needsMaximumData) {
        p.peak_inc_var_index = cvi;
        this.chunk_variables.push(['b-peak', p]);
        cvi++;
        this.chunk_variables.push(['la-peak', p]);
        cvi++;
      }
    }

    // Now *all* variables have been defined. The next step is to set
    // their bounds.

    // NOTE: Chunk variables of node `p` have LB = 0 and UB = UB of `p`.
    // This is effectuated by the VM "set bounds" instructions at run time.

    // NOTE: Under normal assumptions (all processes having LB >= 0), bounds
    // on actor cash flow variables need NOT be set because cash IN and
    // cash OUT will then always be >= 0 (solver's default bounds).
    // However, Linny-R does not prohibit negative bounds on processes, nor
    // negative rates on links. To be consistently permissive, cash IN and
    // cash OUT of all actors are both allowed to become negative.
    for(const k of actor_keys) {
      const a = MODEL.actors[k];
      // NOTE: Add fourth parameter TRUE to signal that the SOLVER's
      // infinity constants should be used, because this is likely to be more
      // efficient, and as cash flows are inferred properties, this will not
      // result in an "unbounded problem" error message from the solver.
      this.code.push(
          [VMI_set_bounds, [a.cash_in_var_index,
              VM.MINUS_INFINITY, VM.PLUS_INFINITY, true]],
          [VMI_set_bounds, [a.cash_out_var_index,
              VM.MINUS_INFINITY, VM.PLUS_INFINITY, true]]
      );
    }

    // NEXT: Define the bounds for all production level variables.
    // NOTE: The VM instructions check dynamically whether the variable
    // index is listed as "fixed" for the round that is being solved.
    for(const k of process_keys) if(!MODEL.ignored_entities[k]) {
      const p = MODEL.processes[k];
      let lbx = p.lower_bound;
      // NOTE: If UB = LB, set UB to LB only if LB is defined,
      // because LB expressions default to -INF while UB expressions
      // default to +INF.
      let ubx = (!p.grid && p.equal_bounds && lbx.defined ? lbx : p.upper_bound);
      if(lbx.isStatic) lbx = lbx.result(0);
      if(ubx.isStatic) {
        ubx = ubx.result(0);
        if(p.grid) lbx = -ubx;
      } else if (p.grid) {
        // When UB is dynamic, pass NULL as LB; the VM instruction will
        // interpret this as "LB = -UB".
        lbx = null;
      }
      // NOTE: When semic_var_index is set, the lower bound must be
      // zero, as the semi-continuous lower bound is implemented with
      // a binary variable.
      if(p.semic_var_index >= 0) lbx = 0;
      // NOTE: Pass TRUE as fourth parameter to indicate that +INF
      // and -INF can be coded as the infinity values used by the
      // solver, rather than the Linny-R values used to detect
      // unbounded problems.
      this.code.push([VMI_set_bounds, [p.level_var_index, lbx, ubx, true]]);
      // Add level variable index to "fixed" list for specified rounds.
      const rf = p.actor.round_flags;
      if(rf != 0) {
        // Note: 32-bit integer `b` is used for bit-wise AND
        let b = 1;
        for(j = 0; j < MODEL.rounds; j++) {
          if((rf & b) != 0) {
            this.fixed_var_indices[j][p.level_var_index] = true;
            // @@ TO DO: fixate associated binary variables if applicable!
          }
          b *= 2;
        }
      }
    }

    // NEXT: Define the bounds for all stock level variables.
    for(const k of product_keys) if(!MODEL.ignored_entities[k]) {
      const p = MODEL.products[k];
      // Get index of variable that is constrained by LB and UB.
      const vi = p.level_var_index;
      if(p.no_slack || !this.diagnose) {
        // If no slack, the bound constraints can be set on the
        // variables themselves.
        let lbx = p.lower_bound;
        // NOTE: If UB = LB, set UB to LB only if LB is defined,
        // because LB expressions default to -INF while UB expressions
        // default to + INF.
        let ubx = (p.equal_bounds && lbx.defined ? lbx : p.upper_bound);
        if(lbx.isStatic) lbx = lbx.result(0);
        if(ubx.isStatic) ubx = ubx.result(0);
        this.code.push([VMI_set_bounds, [vi, lbx, ubx]]);
      } else {
        // Otherwise, set bounds of stock variable to -INF and +INF,
        // as product constraints will be added later on.
        this.code.push([VMI_set_bounds,
            [vi, VM.MINUS_INFINITY, VM.PLUS_INFINITY]]);
      }
    }
    
    // NEXT: Define objective function that maximizes total cash flow.

    // NOTES:
    // (1) As of 19 October 2020, the objective function is *explicitly*
    //     calculated as the (weighted) sum of the cash flows of actors
    //     by adding two EQ constraints per actor.
    // (2) Each process generates cash flow proportional to its production
    //     level if it produces and/or consumes a product having a price.
    //     Cash flow is negative (cash OUT) if a product is consumed AND
    //     has price > 0, but positive (cash IN) if a product is produced
    //     and has price < 0. Likewise for the other two cases.
    //     To calculate the coefficient for the process variable, the
    //     multiplier rates of the links in and out must be calculated (at
    //     run time when dynamic expressions) such that they will add to the
    //     correct cash flow variable (cash IN or cash OUT) of the actor
    //     "owning" the process.
    //     To achieve this, the VM has (since October 2020, revised in
    //     November 2025) a special instruction  VMI_update_cash_coefficient
    //     that operates on two separate coefficient vectors: one for cash IN
    //     and one for cash OUT.
    //     It first calculates the coefficient value (based on link direction,
    //     level, price and rate) and then ADDS it to the process coefficient
    //     in the *cash IN* vector if result > 0, or SUBTRACTS it from the
    //     process coefficient in the *cash OUT* vector if result < 0.
    //     This ensures that all coefficients will be >= 0 for both cash IN
    //     and cash OUT, so that the constraints Cin - a1P1 - ... - anPn = 0
    //     will result in positive values for both flows.
    //     Then in the objective function each actor a will have two variables
    //     contributing the weighted difference + WaCin - WaCout.
    // (3) As of version 3.0, for processes that may have LB < 0, the level
    //     is partitioned, and coefficients are added to/subtracted from the
    //     (always non-negative) variables PEP, NEP, PSC and NSC.
    // (4) The VM has a coefficients vector, and VM instructions operate on
    //     this vector. If expressions for process properties are static, more
    //     efficient VM instructions are used.

    // Initially assume "no cash flows for any actor to be considered".
    // This flag will be set to FALSE when some actor cash flow constraint
    // has a non-zero coefficient.
    this.no_cash_flows = true;
    
    // Iterate over all actors to add the cash flow computation constraints.
    for(const k of actor_keys) {
      const a = MODEL.actors[k];
      // NOTE: No need for VMI_clear_coefficients because the cash flow
      // coefficients operate on two special "registers" of the VM.
      for(const k of process_keys) if(!MODEL.ignored_entities[k]) {
        const p = MODEL.processes[k];
        // Only consider processes owned by this actor.
        if(p.actor === a) {
          if(p.grid) {
            // Grid processes are a special case, as they can have a
            // negative level and potentially multiple slopes. Hence a
            // special VM instruction.
            this.code.push([VMI_update_grid_process_cash_coefficients, p]);
          } else {
            // Iterate over links IN, but only consider consumed products
            // having a market price.
            for(const l of p.inputs) if(!MODEL.ignored_entities[l.identifier] &&
                l.from_node.price.defined) {
              // Modern instruction type: pass link instead of variable index.
              this.code.push([VMI_update_cash_coefficient, l]);
            }
          }
          // Now iterate over links OUT, but only consider produced products
          // having a (non-zero) market price.
          // NOTE: Grid processes can have output links to *data* products,
          // so do NOT skip this iteration...
          for(const l of p.outputs) {
            const
                lm = l.modifier,
                // ... but DO skip links from grid processes to regular products.
                skip = (p.grid && !l.to_node.is_data) ||
                    // If `p` has a non-zero initial value, first commit occurs
                    // at t=0, and then no binary FC indicator is added.
                    (lm === VM.LM_FIRST_COMMIT && p.first_commit_var_index < 0) ||
                    // Throughput of processes is not meaningful because the
                    // inputs of a process may have different units.
                    // The GUI prohibits throughput data links for processes,
                    // but - just in case - skip them here.
                    (lm === VM.LM_THROUGHPUT);
            if(!(skip || MODEL.ignored_entities[l.identifier]) &&
                l.to_node.price.defined) {
              this.code.push([VMI_update_cash_coefficient, l]);
            }
          }
        } // END of IF process "owned" by actor a
      } // END of FOR ALL processes

      // Check whether any VMI_update_cash_coefficient instructions have
      // been added. If so, the objective function will maximze weighted
      // sum of actor cash flows, otherwise minimize sum of process levels.
      const last_vmi = this.code[this.code.length - 1][0];
      this.no_cash_flows = this.no_cash_flows &&
          last_vmi !== VMI_update_cash_coefficient &&
          last_vmi !== VMI_update_grid_process_cash_coefficients;

      // ALWAYS add the two cash flow constraints for this actor, as both
      // cash flow variables must be computed (will be 0 if no cash flows).
      this.code.push([VMI_add_cash_constraints,
          [a.cash_in_var_index, a.cash_out_var_index]]);

    } // END of FOR loop iterating over all actors
    
    // NEXT: Define the coefficients for the objective function.
    this.code.push([VMI_clear_coefficients, null]);

    // NOTE: If, after all actors -- this includes (no actor) -- have been
    // considered, no cash flows have been detected, the solver should aim
    // for minimal effort, i.e., lowest weighted sum of process levels.
    if(this.no_cash_flows) {
      for(const k of process_keys) if(!MODEL.ignored_entities[k]) {
        const
            p = MODEL.processes[k],
            a = p.actor;
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
    } else {
      // If cash flows HAVE been detected, use actor weights as coefficients:
      // positive for their cash IN, and negative for their cash OUT
      for(const k of actor_keys) {
        const a = MODEL.actors[k];
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
      for(const k of process_keys) if(!MODEL.ignored_entities[k]) {
        this.code.push([VMI_add_const_to_coefficient,
            [MODEL.processes[k].level_var_index, -1]]);
      }
    }
    
    // Add small penalty to use "epsilon" variables.
    for(const k of process_keys) if(!MODEL.ignored_entities[k]) {
      const p = MODEL.processes[k];
      if(p.is_zero_var_index >= 0) {
        this.code.push([VMI_add_const_to_coefficient, [p.pep_var_index, -1]]);
        this.code.push([VMI_add_const_to_coefficient, [p.nep_var_index, -1]]);
      }
    }
    for(const k of product_keys) if(!MODEL.ignored_entities[k]) {
      const p = MODEL.products[k];
      if(p.is_zero_var_index >= 0) {
        this.code.push([VMI_add_const_to_coefficient, [p.pep_var_index, -1]]);
        this.code.push([VMI_add_const_to_coefficient, [p.nep_var_index, -1]]);
      }
    }

    // Copy the VM coefficient vector to the objective function coefficients.
    // NOTE: for the VM's current time step (VM.t)!
    this.code.push([VMI_set_objective, null]);

    // NOTES:
    // (1) Scaling of the objective function coefficients is performed by
    //     the VM just before the tableau is submitted to the solver, so
    //     for now it suffices to differentiate between the different
    //     "priorities" of slack variables.
    // (2) Slack variables have different penalties: type 0 = market demands,
    //     i.e., EQ constraints on stocks, 1 = GE and LE constraints on product
    //     levels, 2 = strongest constraints: on data, or set by boundlines.
    for(const k of product_keys) if(!MODEL.ignored_entities[k]) {
      const p = MODEL.products[k];
      if(p.level_var_index >= 0 && !p.no_slack && this.diagnose) {
        const
            hb = p.hasBounds,
            pen = (p.is_data ? 2 :
                // NOTE: Lowest penalty also for IMPLIED sources and sinks.
                (p.equal_bounds || (!hb && (p.isSourceNode || p.isSinkNode)) ? 0 :
                    (hb ? 1 : 2)));
        this.slack_variables[pen].push(
            p.stock_LE_slack_var_index, p.stock_GE_slack_var_index);
      }
    }
    
    // NEXT: Add semi-continuous constraints only if not supported by solver.
    if(this.noSemiContinuous) {
      for(const k of process_keys) if(!MODEL.ignored_entities[k]) {
        this.code.push([VMI_add_semicontinuous_constraints, MODEL.processes[k]]);
      }
    }
    
    // NEXT: Add constraints for processes representing grid elements.
    if(MODEL.with_power_flow) {
      for(const k of process_keys) if(!MODEL.ignored_entities[k]) {
        const p = MODEL.processes[k];
        if(p.grid) {
          this.code.push([VMI_add_grid_process_constraints, p]);
        }
      }
      if(!MODEL.ignore_KVL) this.code.push(
          [VMI_add_kirchhoff_constraints, POWER_GRID_MANAGER.cycle_basis]);
    }

    // NEXT: Add product constraints to calculate (and constrain) their stock.

    for(const k of product_keys) if(!MODEL.ignored_entities[k]) {
      const p = MODEL.products[k];
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
          // NOTE: Pass special constraint type parameter to indicate
          // that this constraint must be scaled by the cash scalar.
          this.code.push([VMI_add_constraint, VM.ACTOR_CASH]);
        } else {
          console.log('ANOMALY: no actor for cash flow product', p.displayName);
        }
      // NOTE: Constants are not affected by their outgoing data (!) links.
      } else if(!p.isConstant) {

        // FIRST BIG STEP: Add a constraint that "computes" the product stock
        // level.
        // Set coefficients vector to 0. NOTE: This also sets RHS to 0.
        this.code.push([VMI_clear_coefficients, null]);
  
        // Add inflow into product P from all its input nodes.
        for(const l of p.inputs) if(!MODEL.ignored_entities[l.identifier]) {
          const fn = l.from_node;
          let vi = fn.level_var_index;
          // If data flow, use the appropriate variable.
          if(l.multiplier === VM.LM_POSITIVE) {
            vi = fn.plus_var_index;
          } else if (l.multiplier === VM.LM_ZERO) {
            vi = fn.is_zero_var_index;
          } else if (l.multiplier === VM.LM_NEGATIVE) {
            vi = fn.minus_var_index;
          } else if(l.multiplier === VM.LM_STARTUP) {
            vi = fn.start_up_var_index;
          } else if(l.multiplier === VM.LM_FIRST_COMMIT) {
            vi = fn.first_commit_var_index;
            // NOTE: If `p` has a non-zero initial value, first commit links
            // are ignored.
            if(vi < 0) continue;
          } else if(l.multiplier === VM.LM_SHUTDOWN) {
            vi = fn.shut_down_var_index;
          } else if(l.multiplier === VM.LM_PEAK_INC) {
            vi = fn.peak_inc_var_index;
          }
          // Check whether the incoming link is a power flow. This is the case
          // when the FROM node is a grid process and the link is a regular
          // flow. Note that "is not data" would suffice, but the multiplier
          // type is checked just to be sure.
          if(l.multiplier === VM.LM_LEVEL && !p.is_data && fn.grid) {
            // If so, pass the grid process to a special VM instruction
            // that will add coefficients that account for losses.
            // NOTES:
            // (1) The second parameter (+1) indicates that the
            //     coefficients of the UP flows should be positive
            //     and those of the DOWN flows should be negative
            //     (because it is a P -> Q link).
            // (2) The rate and delay properties of the link are ignored.
            this.code.push(
                [VMI_add_power_flow_to_coefficients, [fn, 1]]);
          } else if(l.multiplier === VM.LM_THROUGHPUT) {
            // NOTE: New instruction style that passes pointers to
            // model entities instead of their properties.
            if(!(fn instanceof Process)) this.code.push(
                [VMI_add_throughput_to_coefficients, l]);
          } else if(l.multiplier === VM.LM_PEAK_INC) {
            // SPECIAL instruction that adds flow only for first t of block.
            // NOTE: No delay on this type of link.
            this.code.push([VMI_add_peak_increase_at_t_0,
                [vi, l.relative_rate]]);
          } else if(l.multiplier === VM.LM_MAX_INCREASE) {
            // NOTE: New instruction style that passes pointers to
            // model entities instead of their properties.
            this.code.push([VMI_add_max_increase, l]);
          } else if(l.multiplier === VM.LM_MAX_DECREASE) {
            // NOTE: New instruction style that passes pointers to
            // model entities instead of their properties.
            this.code.push([VMI_add_max_decrease, l]);
          } else if(l.multiplier === VM.LM_SPINNING_RESERVE) {
            // "spinning reserve" equals UB - level if level > 0,
            // -LB - level if level < 0, and otherwise 0.
            // NOTE: New instruction style that passes pointers to
            // model entities instead of their properties.
            this.code.push([VMI_add_spinning_reserve, l]);
          } else if(l.relative_rate.isStatic) {
            // Static rates permit simpler VM instructions
            const c = l.relative_rate.result(0);
            if(l.multiplier === VM.LM_SUM) {
              this.code.push([VMI_add_const_to_sum_coefficients,
                  [vi, c, l.flow_delay]]);
            } else if(l.multiplier === VM.LM_MEAN) {
              this.code.push([VMI_add_const_to_sum_coefficients,
                  // NOTE: 4th parameter = 1 indicates "divide c by delay + 1"
                  [vi, c, l.flow_delay, 1]]);
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
            // NOTE: Rate is now an expression.
            const rx = l.relative_rate;
            if(l.multiplier === VM.LM_SUM) {
              this.code.push([VMI_add_var_to_weighted_sum_coefficients,
                  [vi, rx, l.flow_delay]]);
            } else if(l.multiplier === VM.LM_MEAN) {
              this.code.push([VMI_add_var_to_weighted_sum_coefficients,
                  [vi, rx, l.flow_delay, 1]]);
            } else {
              this.code.push([VMI_add_var_to_coefficient,
                  [vi, rx, l.flow_delay]]);
              if(l.multiplier === VM.LM_INCREASE) {
                this.code.push([VMI_subtract_var_from_coefficient,
                    // NOTE: 4th argument indicates "delay + 1"
                    [vi, rx, l.flow_delay, 1]]);
              }
            }
          }
        } // END FOR all inputs
        
        // Subtract outflow from product P to consuming processes (outputs)
        for(const l of p.outputs) if(!MODEL.ignored_entities[l.identifier]) {
          const tn = l.to_node;
          // NOTE: Only consider outputs to processes; data flows do
          // not subtract from their tail nodes.
          if(tn instanceof Process) {
            if(tn.grid) {
            // If the link is a power flow, pass the grid process to
            // a special VM instruction that will add coefficients that
            // account for losses.
            // NOTES:
            // (1) The second parameter (-1) indicates that the
            //     coefficients of the UP flows should be negative
            //     and those of the DOWN flows should be positive
            //     (because it is a Q -> P link).
            // (2) The rate and delay properties of the link are ignored.
            this.code.push(
                [VMI_add_power_flow_to_coefficients, [tn, -1]]);
            } else {
              const rr = l.relative_rate;
              if(rr.isStatic) {
                this.code.push([VMI_subtract_const_from_coefficient,
                    [tn.level_var_index, rr.result(0), l.flow_delay]]);
              } else {
                this.code.push([VMI_subtract_var_from_coefficient,
                    [tn.level_var_index, rr, l.flow_delay]]);
              }
            }
          }
        }
        
        // NOTES:
        // (1) For products with storage, set the coefficient for this product's
        //     stock IN THE PREVIOUS TIME STEP to 1
        // (2) The VM instruction will subtract the stock level at the end of the
        //     previous block from the RHS if t=block_start, or the initial level
        //     if t=1
        if(p.is_buffer) {
          this.code.push([VMI_add_const_to_coefficient,
              [p.level_var_index, 1, 1]]); // delay of 1
        }
        
        // Set the coefficient for this product's stock NOW to -1 so that
        // the EQ constraint (having RHS = 0) will effectuate that the
        // stock variable takes on the correct value.
        // NOTE: Do this only when `p` is NOT data, or `p` has links
        // IN or OUT (meaning: 1 or more coefficients).
        if(!p.is_data || p.inputs.length + p.outputs.length > 0) {
          this.code.push([VMI_add_const_to_coefficient,
              [p.level_var_index, -1]]);
          this.code.push([VMI_add_constraint, VM.EQ]);
        }
      } // END of IF p not a constant

      // Set the bound constraints on the product stock variable
      this.setProductBoundConstraints(p);
    } // End of FOR all products

    // NEXT: add constraints that will set values of binary variables
    // NOTE: This is not trivial!
    /*
       Nodes with special output arrows will also have BINARY variables.
       For each timestep t:
        - POS[t] = 1 if process level or stock level > 0
        - NEG[t] = 1 if process level or stock level < 0
        - IZ[t] = 1 - OO[t]  so 1 if zero
        - SU[t] = 1 iff OO[t] - OO[t-1] > 0  so 1 iff startup
  
       Assuming L[t] to be the stock or level of a node, literature suggests
       that these constraints can be added for each t to obtain the correct
       binary values:
       
       (a)   L[t] - M*POS[t] <= 0
       (b)  -L[t] - M*NEG[t] <= 0
       (c)  OO[t] = POS[t] + NEG[t]
       (d)  POS[t] + NEG[t] + IZ[t] = 1
       
       where "big" M is the highest absolute bound value plus 1 for the case
       that both bounds are zero. So M = MAX(ABS(UB[t]), ABS(LB[t])) + 1
       NOTE: When UB is infinite, the modeler is notified while code for
       binaries is generated.

       Note that because of (a) POS *must* be 1 when L > 0, but *may* also be
       1 when L <= 0, and because of (b) NEG *must* be 1 when L < 0, but *may*
       be 1 when L >= 0. This ambiguity is reduced by (c) and (d):
          L    POS NEG  OO  IZ
         < 0    0   1    1   0  (OO cannot be 2, zo POS *must* be 0)
         > 0    1   0    1   0  (OO cannot be 2, so NEG *must* be 0)
         = 0    0   0    0   1  (OO *must* be 0 to satisfy POS + NEG + IZ = 1)

       HOWEVER: this is not guaranteed because when L=0, the solver may pick
       POS=0 NEG=1 OO=1 IZ=0. Hence this more elaborate solution:

       EXTRA VARIABLES: To separate POS, NEG and (near) zero, two semi-continuous
       variables POSL and NEGL are added having a near-zero lower bound "epsilon"
       (say 1e-5) and their respective upper bounds equal to UB and LB of L, and
       two normal variables PEP and NEP having LB = 0 and UB = "epsilon".
       The three binary variables now are NEG (1 if NEGL >= epsilon), POS (1 if
       POSL >= epsilon) and OFF (1 if PEP + NEP >= 0). The constraints to be
       added are:
       
       (a) L = POSL + PEP - NEP - NEGL
       
       This "partitions" the level in four components. The following constraints
       ensure a (functionally) unique partitioning:
       
       (b) NEGL - M*NEG <= 0  (so NEG=1 if NEGL > 0, which means >= epsilon)
       (c) POSL - M*POS <= 0  (so POS=1 if POSL > 0, so also >= epsilon)
       (d) POS + NEG <= 1     (so NEGL and POSL cannot both be non-negative)
       
       The two "sub-epsilon" parts need not be used *except* when |L| < epsilon,
       because neither NEGL nor POSL can "match" a near-zero value. Hence the
       following constraint makes that OFF=1 if NEP and/or PEP are non-zero. 

       (e) NEP + PEP - M*IZ <= 0  (so IZ=1 if |L| < epsilon)
       
       To ensure that NEGL and POSL do not cancel each other out, NEG and POS
       cannot add up to more than 1:
       
       (f) POS + NEG <= 1

       No variable ON is computed since (POS + NEG) can be used.

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
    // NOTE: As of 20 June 2021, binary attributes of products are also computed.
    const pp_nodes = [];
    for(const k of process_keys) if(!MODEL.ignored_entities[k]) {
      pp_nodes.push(MODEL.processes[k]);
    }
    for(const k of product_keys) if(!MODEL.ignored_entities[k]) {
      pp_nodes.push(MODEL.products[k]);
    }

    for(const p of pp_nodes) {
      if(p.is_zero_var_index >= 0) {
        // Add code for the four constraints that set the binaries.
        // NOTE: As of version 3.0 (November 2025) this is done efficiently
        // by the new VM instruction VMI_add_NZP_binary_constraints that
        // simply takes the node `p` as parameter.
        this.code.push([VMI_add_NZP_binary_constraints, p]);
        // Also add constraints for start-up and first commit (if needed).
        if(p.start_up_var_index >= 0) {
          this.code.push([VMI_add_startup_constraints, p]);
          // NOTE: When `p` has a non-zero level at t=0, first commit is
          // ignored (because always 0), no indicator variables are defined,
          // and hence no constraints will be added. 
          if(p.first_commit_var_index >= 0) {
            this.code.push([VMI_add_first_commit_constraints, p]);
          }
        }
        // Likewise add constraints for shut-down (if needed).
        if(p.shut_down_var_index >= 0) {
          this.code.push([VMI_add_shutdown_constraints, p]);
        }
      } // END IF product has on/off binary variable
      
      // Check whether constraints (n) through (p) need to be added
      // to compute the peak level for a block of time steps.
      // NOTE: This is independent of the binary variables!
      if(p.peak_inc_var_index >= 0) {
        this.code.push(
          // One special instruction implements this operation, as part
          // of it must be performed only at block time = 0.
          [VMI_add_peak_increase_constraints, p]
        );          
      }
    } // END of FOR all processes and products
  
    // NEXT: Add composite constraints.
    // NOTE: As of version 1.0.10, constraints are implemented using special
    // ordered sets (SOS2). This is effectuated with a dedicated VM instruction
    // for each of its "active" bound lines. This instruction requires these
    // parameters:
    // - variable indices for the constraining node X, the constrained node Y
    // - expressions for the LB and UB of X and Y
    // - the bound line object, as this provides all further information
    for(const k of constraint_keys) if(!MODEL.ignored_entities[k]) {
      const
         c = MODEL.constraints[k],
         x = c.from_node,
         y = c.to_node;
      for(const bl of c.bound_lines) {
        this.code.push([VMI_add_bound_line_constraint,
            [x.level_var_index, x.lower_bound, x.upper_bound,
                y.level_var_index, y.lower_bound, y.upper_bound, bl]]);
      }
    }

    MODEL.set_up = true;
    this.logMessage(1,
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
    for(let k in MODEL.links) if(MODEL.links.hasOwnProperty(k) &&
        !MODEL.ignored_entities[k]) {
      for(let t = this.block_start; t < this.block_start + this.chunk_length; t++) {
        const r = MODEL.links[k].relative_rate.result(t);
        // NOTE: ignore errors and "undefined" (chunk Length may exceed actual block length)
        if(r <= VM.PLUS_INFINITY) {
          high_rate = Math.max(high_rate, Math.abs(r));
        }
      }
    }
    // Similar to links, composite constraints X-->Y can act as multipliers:
    // since CC map the range (UB - LB) of node X to range (UB - LB) of node Y,
    // the multiplier is rangeY / rangeX:
    for(let k in MODEL.constraints) if(MODEL.constraints.hasOwnProperty(k) &&
        !MODEL.ignored_entities[k]) {
      const c = MODEL.constraints[k];
      for(let t = this.block_start; t < this.block_start + this.chunk_length; t++) {
        const
            fnlb = c.from_node.lower_bound.result(t),
            fnub = c.from_node.upper_bound.result(t),
            tnlb = c.to_node.lower_bound.result(t),
            tnub = c.to_node.upper_bound.result(t),
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
      this.logMessage(this.block_count, this.WARNING +
          'Max. slack penalty reached; try to scale down your model coefficients');
    }
    const m = Math.max(
        Math.abs(this.low_coefficient), Math.abs(this.high_coefficient));
    // Scaling is useful if m is larger than 2.
    if(m > 2 && m < VM.PLUS_INFINITY) {
      // Use reciprocal because multiplication is faster than division.
      const scalar = 2 / m;
      this.scaling_factor = 0.5 * m;
      for(let i in this.objective) if(Number(i)) this.objective[i] *= scalar;
      this.low_coefficient *= scalar;
      this.high_coefficient *= scalar;
    } else {
      this.scaling_factor = 1;
    }
  }

  scaleCashFlowConstraints() {
    // Scale cash flow coefficients per actor by dividing them by the
    // largest cash flow coefficient (in absolute value) within the
    // current block so that cash flows cannot easily "overrule" the
    // slack penalties in the objective function.
    // NOTE: No scaling needed if model features no cash flows, or if
    // cash scalar equals 1.
    if(this.no_cash_flows || this.cash_scalar === 1) return;
    this.logMessage(this.block_count,
        'Cash flows scaled by 1/' + this.cash_scalar);
    // Use reciprocal as multiplier to scale the constraint coefficients.
    const m = 1 / this.cash_scalar;
    let cv;
    for(const k of this.cash_constraints) {
      const cc = this.matrix[k];
      for(let ci in cc) if(cc.hasOwnProperty(ci)) {
        if(ci < this.chunk_offset) {
          // NOTE: Subtract 1 as variables array is zero-based.
          cv = this.variables[(ci - 1) % this.cols];
        } else {
          // Chunk variable array is zero-based.
          cv = this.chunk_variables[ci - this.chunk_offset];
        }
        // NOTE: Do not scale the coefficient of the cash variable.
        if(cv && !cv[0].startsWith('C')) cc[ci] *= m;
      }
    }
    // In case the model contains data products that represent an actor
    // cash flow, the coefficients of the constraint that equates the
    // product level to the cash flow must be *multiplied* by the cash
    // scalar so that they equal the cash flow in the model's monetary unit.
    for(const k of this.actor_cash_constraints) {
      const cc = this.matrix[k];
      for(let ci in cc) if(cc.hasOwnProperty(ci)) {
        if(ci < this.chunk_offset) {
          // NOTE: Subtract 1 as variables array is zero-based.
          cv = this.variables[(ci - 1) % this.cols];
        } else {
          // Chunk variable array is zero-based.
          cv = this.chunk_variables[ci - this.chunk_offset];
        }
        // NOTE: Scale coefficients of cash variables only.
        if(cv && cv[0].startsWith('C')) cc[ci] *= this.cash_scalar;
      }
    }
  }
  
  checkForInfinity(n) {
    // Return floating point number `n`, or +INF or -INF if the absolute
    // value of `n` is relatively (!) close to the VM infinity constants
    // (since the solver may return imprecise values of such magnitude).
      if(n > 0.5 * VM.PLUS_INFINITY && n < VM.BEYOND_PLUS_INFINITY) {
      return VM.PLUS_INFINITY;
    } 
    if(n < 0.5 * VM.MINUS_INFINITY && n > VM.BEYOND_MINUS_INFINITY) {
      return VM.MINUS_INFINITY;
    }
    // NOTE: Also round near-zero values to 0.
    if(Math.abs(n) <= VM.NEAR_ZERO) return 0;
    return n;
  }

  setLevels(block, round, x, err) {
    // Copy the values of decision variables calculated by the solver.
    // `x` holds the solver result, `err` is TRUE if the model was not
    // computed. First deal with quirk of JSON, which turns a list with
    // one value into just that value as a number.
    if(!(x instanceof Array)) x = [x];
    // `bb` is first time step of this block (blocks are numbered 1, 2, ...)
    // `abl` is the actual block length, i.e., # time steps to set levels for,
    // `cbl` is the cropped block length (applies only to last block).
    let bb = (block - 1) * MODEL.block_length + 1,
        abl = this.chunk_length,
        cbl = this.actualBlockLength(block);
    // If no results computed, preserve those already computed for the
    // pervious chunk as "look-ahead".
    if(err && block > 1 && MODEL.look_ahead > 0) {
      bb += MODEL.look_ahead;
      abl -= MODEL.look_ahead;
      cbl -= MODEL.look_ahead;
      this.logMessage(block,
          'No results from solver -- retained results of ' +
              pluralS(MODEL.look_ahead, 'look-ahead time step'));
    }
    // For the last block, crop the actual block length so it does not
    // extend beyond the simulation period (these results should be ignored).
    if(cbl < 0) {
      this.logMessage(block, 'Results of last optimization could be discarded');
      abl = 0;
    } else if(cbl < abl) {
      this.logMessage(block, ['Last chunk (',
          pluralS(this.chunk_length, 'time step'), ') cropped to ',
          pluralS(cbl, 'time step')].join(''));
      abl = cbl;
    }
    // NOTE: Length of solution vector divided by number of columns should
    // be integer, and typically equal to the actual block length.
    const
        ncv = this.chunk_variables.length,
        ncv_msg = (ncv ? ' minus ' + pluralS(ncv, 'singular variable') : ''),
        xratio = (x.length - ncv) / this.cols,
        xbl = Math.floor(xratio);
    if(xbl < xratio) console.log('ANOMALY: solution vector length', x.length,
        ncv_msg + ' is not a multiple of # columns', this.cols);
    // Set cash flows for all actors.
    // NOTE: All cash IN and cash OUT values should normally be non-negative,
    // but since Linny-R permits negative lower bounds on processes, and also
    // negative link rates, cash flows may become negative. If that occurs,
    // the modeler should be warned.
    for(let k in MODEL.actors) if(MODEL.actors.hasOwnProperty(k)) {
      const a = MODEL.actors[k];
      // NOTE: `b` is the index to be used for the vectors.
      let b = bb;
      // Iterate over all time steps in this block.
      // NOTE: -1 because indices start at 1, but list is zero-based.
      let j = -1; 
      for(let i = 0; i < abl; i++) {
        // NOTE: Cash coefficients computed by the solver must be scaled back.
        a.cash_in[b] = this.checkForInfinity(
            x[a.cash_in_var_index + j] * this.cash_scalar);
        a.cash_out[b] = this.checkForInfinity(
            x[a.cash_out_var_index + j] * this.cash_scalar);
        a.cash_flow[b] = this.noNearZero(a.cash_in[b] - a.cash_out[b]);
        if(!MODEL.ignore_negative_flows) {
          // Count occurrences of a negative cash flow (threshold -0.5 cent).
          if(b <= this.nr_of_time_steps && a.cash_in[b] < -0.005) {
            this.logMessage(block, `${this.WARNING}(t=${b}${round}) ` +
                a.displayName + ' cash IN = ' + a.cash_in[b].toPrecision(2));
          }
          if(b <= this.nr_of_time_steps && a.cash_out[b] < -0.005) {
            this.logMessage(block, `${this.WARNING}(t=${b}${round}) ` +
                a.displayName + ' cash OUT = ' + a.cash_out[b].toPrecision(2));
          }
        }
        // Advance column offset in tableau by the # cols per time step.
        j += this.cols;
        // Advance to the next time step in this block.
        b++;
      }
    }
    // Initialize total power flows per grid as 0.
    for(let k in MODEL.power_grids) if(MODEL.power_grids.hasOwnProperty(k)) {
      MODEL.power_grids[k].total_flows = 0;
    }
    // Keep track of non-zero epsilon variables.
    this.plus_eps_count = 0;
    this.plus_eps_sum = 0;
    this.minus_eps_count = 0;
    this.minus_eps_sum = 0;
    // Set production levels and start-up moments for all processes.
    for(let k in MODEL.processes) if(MODEL.processes.hasOwnProperty(k) &&
        !MODEL.ignored_entities[k]) {
      const
          p = MODEL.processes[k],
          has_NZP = (p.is_zero_var_index >= 0),
          has_SU = (p.start_up_var_index >= 0),
          has_SD = (p.shut_down_var_index >= 0);
      // Clear all start-ups and shut-downs at t >= bb, as these may have
      // been set for time steps in the look-ahead period.
      if(has_SU) p.resetStartUps(bb);
      if(has_SD) p.resetShutDowns(bb);
      // NOTE: `b` is the index to be used for the vectors.
      let b = bb;
      // Iterate over all time steps in this block.
      // NOTE: -1 because indices start at 1, but list is zero-based.
      let j = -1; 
      for(let i = 0; i < abl; i++) {
        // NOTE: CheckForInfinity also rounds near-zero values to 0.
        p.level[b] = this.checkForInfinity(x[p.level_var_index + j]);
        if(has_NZP) {
          // NOTE: Some solvers (Gurobi!) may return real numbers instead of
          // integers, typically near-zero or near-one, so only consider
          // values near 1 to indicate start-up.
          // If IZ = 1, set level to 0.
          if(x[p.is_zero_var_index + j] > 0.999) {
            // If IZ = 1, set (near-zero) level to 0.
            if(p.level[b]) {
              // Log to the console if level is clearly higher than near-zero.
              if(Math.abs(p.level[b]) > VM.SIG_DIF_FROM_ZERO) {
                console.log('NOTE: Level of', p.displayName,
                    'is truncated from', p.level[b],
                    'to 0 because OFF =', x[p.is_zero_var_index + j],
                    'POS =', x[p.plus_var_index + j],
                    'NEG =', x[p.minus_var_index + j]);
              }
              // Always truncate.
              p.level[b] = 0;
            }
          }
          if(has_SU) {
            if(x[p.start_up_var_index + j] > 0.999) {
              p.start_ups.push(b);
            }
          }
          if(has_SD) {
            if(x[p.shut_down_var_index + j] > 0.999) {
              p.shut_downs.push(b);
            }
          }
          // Keep track of near-zero levels that use epsilon.
          if(x[p.pep_var_index + j]) {
            this.plus_eps_count++;
            this.plus_eps_sum += x[p.pep_var_index + j];
          }
          if(x[p.nep_var_index + j]) {
            this.minus_eps_count++;
            this.minus_eps_sum += x[p.nep_var_index + j];
          }          
        } else {
          const apl = Math.abs(p.level[b]);
          if(apl && apl < 0.005) {
            // Test small but not evidently near-zero values by scaling
            // them to the process bounds (using 1000 instead of INFINITY).
            const
                lb = p.lower_bound.result(b),
                br = (p.equal_bounds ? 0 : Math.min(p.upper_bound.result(b), 1000) - lb);
            if(br > 1 && apl / br < VM.ON_OFF_THRESHOLD) {
              console.log('Level of', p.displayName, 'at t =', b,
                  'is virtually zero (' +  apl + ') considering bound range', br);
              p.level[b] = 0;
            }
          }
        }
        if(p.grid) p.grid.total_flows += Math.abs(p.level[b]);
        // Advance column offset in tableau by the # cols per time step.
        j += this.cols;
        // Advance to the next time step in this block.
        b++;
      }
    }
    // Set stock levels for all products.
    for(let k in MODEL.products) if(MODEL.products.hasOwnProperty(k) &&
        !MODEL.ignored_entities[k]) {
      const
          p = MODEL.products[k],
          has_NZP = (p.is_zero_var_index >= 0),
          has_SU = (p.start_up_var_index >= 0),
          has_SD = (p.shut_down_var_index >= 0);
      // Clear all start-ups and shut-downs at t >= bb.
      if(has_SU) p.resetStartUps(bb);
      if(has_SD) p.resetShutDowns(bb);
      let b = bb;
      // Iterate over all time steps in this block.
      let j = -1;
      for(let i = 0; i < abl; i++) {
        p.level[b] = this.checkForInfinity(x[p.level_var_index + j]);
        if(has_NZP) {
          // Check if start-up variable is set (see NOTE above).
          if(has_SU) {
            if(x[p.start_up_var_index + j] > 0.999) {
              p.start_ups.push(b);
            }
          }
          // Same for shut-down variable.
          if(has_SD) {
            if(x[p.shut_down_var_index + j] > 0.999) {
              p.shut_downs.push(b);
            }
          }
          // Keep track of near-zero levels that use epsilon.
          if(x[p.pep_var_index + j]) {
            this.plus_eps_count++;
            this.plus_eps_sum += x[p.pep_var_index + j];
          }
          if(x[p.nep_var_index + j]) {
            this.minus_eps_count++;
            this.minus_eps_sum += x[p.nep_var_index + j];
          }          
        }
        j += this.cols;
        b++;
      }
    }
    // Get values of peak increase variables from solution vector.
    // NOTE: Computed offset takes into account that chunk variable list
    // is zero-based!
    const offset = this.cols * abl;
    for(let i = 0; i < ncv; i++) {
      const p = this.chunk_variables[i][1];
      p.b_peak_inc[block] = x[offset + i];
      i++;
      p.la_peak_inc[block] = x[offset + i];
      // Compute the peak from the peak increase.
      p.b_peak[block] = p.b_peak[block - 1] + p.b_peak_inc[block];
    }
    // Add warning to messages if slack has been used, or some process
    // level is "infinite" while diagnosing an unbounded problem.
    // NOTE: Only check after the last round has been evaluated.
    if(round === this.lastRound) {
      let b = bb;
      // Iterate over all time steps in this block.
      let j = -1;
      for(let i = 0; i < abl; i++) {
        // Iterates over 3 types of slack variable.
        for(const svi_list of this.slack_variables) {
          // Each list contains indices of slack variables
          for(const vi of svi_list) {
            const
                slack = parseFloat(x[vi + j]),
                absl = Math.abs(slack);
            if(absl > VM.NEAR_ZERO) {
              const v = this.variables[vi - 1];
              // NOTE: For constraints, add 'UB' or 'LB' to its vector for
              // the time step where slack was used.
              if(v[1] instanceof BoundLine) v[1].constraint.slack_info[b] = v[0];
              if(b <= this.nr_of_time_steps && absl > VM.ON_OFF_THRESHOLD) {
                this.logMessage(block, `${this.WARNING}(t=${b}${round}) ` +
                    `${v[1].displayName} ${v[0]} slack = ` +
                    // NOTE: TRUE denotes "show tiny values with precision".
                    this.sig4Dig(slack, true));
                if(v[1] instanceof Product) {
                  // Ensure that clusters containing this product "know" that
                  // slack is used so that they will be drawn in color.
                  for(const ppc of v[1].productPositionClusters) {
                    ppc.usesSlack(b, v[1], v[0]);
                  }
                }
              } else if(MODEL.show_notices) {
                this.logMessage(block, '---- Notice: (t=' + b + round + ') ' +
                   v[1].displayName + ' ' + v[0] + ' slack = ' +
                   safeToPrecision(slack, 1));
              }
            }
          }
        }
        if(this.diagnose) {
          // Iterate over all processes, and set the "slack use" flag
          // for their cluster so that these clusters will be highlighted.
          for(let k in MODEL.processes) if(MODEL.processes.hasOwnProperty(k) &&
              !MODEL.ignored_entities[k]) {
            const
                p = MODEL.processes[k],
                l = p.level[b];
            if(l >= VM.PLUS_INFINITY) {
              this.logMessage(block,
                  `${this.WARNING}(t=${b}${round}) ${p.displayName} has level +INF`);
              // NOTE: +INF is signalled in blue, just like use of LE slack.
              p.cluster.usesSlack(b, p, 'LE');
            } else if(l <= VM.MINUS_INFINITY) {
              this.logMessage(block,
                  `${this.WARNING}(t=${b}${round}) ${p.displayName} has level -INF`);
              // NOTE: -INF is signalled in red, just like use of GE slack.
              p.cluster.usesSlack(b, p, 'GE');
            }
          }
        }
        j += this.cols;
        b++;
      }
    }
    if(this.plus_eps_count) this.logMessage(block,
        pluralS(this.plus_eps_count, 'positive epsilon') +
        '; sum = ' + safeToPrecision(this.plus_eps_sum, 3));
    if(this.minus_eps_count) this.logMessage(block,
        pluralS(this.minus_eps_count, 'negative epsilon') +
        '; sum = ' + safeToPrecision(this.minus_eps_sum, 3));
  }
  
  severestIssue(list, result) {
    // Returns severest exception code or +/- INFINITY in `list`, or the
    // result of the computation that involves the elements of `list`.
    let issue = 0;
    for(const ec of list) {
      if(ec <= VM.MINUS_INFINITY) {
        issue = Math.min(ec, issue);
      } else if(ec >= VM.PLUS_INFINITY) {
        issue = Math.max(ec, issue);
      }
    }
    if(issue) return issue;
    return result;
  }
  
  calculateDependentVariables(block) {
    // Calculate the values of all model variables that depend on the
    // values of the decision variables output by the solver.
    // NOTE: Only for the block that was just solved, but the values are
    // stored in the vectors of nodes and links that span the entire
    // optimization period, hence start by calculating the offset `bb`
    // being the first time step of this block.
    // Blocks are numbered 1, 2, ...
    let latest_time_step = 0;
    const
        bb = (block - 1) * MODEL.block_length + 1,
        cbl = this.actualBlockLength(block);

    // Start with an empty list of variables to "fixate" in the next block.
    this.variables_to_fixate = {};
    // FIRST: Calculate the actual flows on links.
    for(let k in MODEL.power_grids) if(MODEL.power_grids.hasOwnProperty(k)) {
      MODEL.power_grids[k].total_losses = 0;
    }
    for(let k in MODEL.links) if(MODEL.links.hasOwnProperty(k) &&
        !MODEL.ignored_entities[k]) {
      const l = MODEL.links[k];
      // NOTE: Flow is determined by the process node, or in case
      // of a P -> P data link by the FROM product node.
      const p = (l.to_node instanceof Process ? l.to_node : l.from_node);
      // Iterate over all time steps in this chunk.
      for(let i = 0; i < cbl; i++) {
        // NOTE: Flows may have a delay (but will be 0 for grid processes).
        const
            b = bb + i,
            ld = l.actualDelay(b),
            bt = b - ld;
        latest_time_step = Math.max(latest_time_step, bt);
        // If delay < 0 AND this results in a block time beyond the
        // block length, this means that the level of the FROM node
        // must be "fixated" in the next block.
        const nbt = bt - bb - MODEL.block_length + 1;
        // NOTE: `nbt` (next block time) cannot be beyond the look-ahead
        // period, as for those time steps the levels are still undefined,
        // NOR can it be later than the duration of the (negative) delay
        // on the link. 
        if(ld < 0 && nbt > 0 && nbt <= MODEL.look_ahead && nbt <= -ld) {
          this.addNodeToFixate(l.from_node, nbt,
              // NOTE: Use the level at time `bt` (i.e., in the future)
              // because that is the optimal level computed for this chunk
              // (in its look-ahead period) that should be maintained in
              // the next block.
              l.from_node.nonZeroLevel(bt));
        }
        // NOTE: Block index may fall beyond actual chunk length.
        const ci = i - ld;
        // NOTE: Use non-zero level here to ignore non-zero values that
        // are very small relative to the bounds on the process
        // (typically values below the non-zero tolerance of the solver).
        let pl = p.nonZeroLevel(bt);
        if(l.multiplier === VM.LM_SPINNING_RESERVE) {
          pl = (pl > 0 ? p.upper_bound.result(bt) - pl : 0);
        } else if(l.multiplier === VM.LM_POSITIVE) {
          pl = (pl > 0 ? 1 : 0);
        } else if(l.multiplier === VM.LM_ZERO) {
          pl = (pl ? 0 : 1);
        } else if(l.multiplier === VM.LM_NEGATIVE) {
          pl = (pl < 0 ? 1 : 0);
        } else if(l.multiplier === VM.LM_STARTUP) {
          // NOTE: For start-up, first commit and shut-down, the level
          // can be ignored, as it suffices to check whether time step
          // `bt` occurs in the list of start-up time steps.
          pl = (p.start_ups.indexOf(bt) < 0 ? 0 : 1);
        } else if(l.multiplier === VM.LM_FIRST_COMMIT) {
          // NOTE: First commit is ignored when `p` has non-zero initial level.
          if(p.first_commit_var_index < 0) {
            pl = 0;
          } else {
            // NOTE: Here, check whether FIRST start-up occurred at `bt`.
            // This means that `bt` must be the *first* value in the list.
            pl = (p.start_ups.indexOf(bt) === 0 ? 1 : 0);
          }
        } else if(l.multiplier === VM.LM_SHUTDOWN) {
          // Similar to STARTUP, but now look in the shut-down list.
          pl = (p.shut_downs.indexOf(bt) < 0 ? 0 : 1);
        } else if(l.multiplier === VM.LM_MAX_INCREASE) {
          pl = p.upper_bound.result(bt) - pl;
        } else if(l.multiplier === VM.LM_MAX_DECREASE) {
          pl = -p.lower_bound.result(bt) + pl;
        } else if(l.multiplier === VM.LM_INCREASE) {
          const ppl = p.actualLevel(bt - 1);
          pl = this.severestIssue([pl, ppl], pl - ppl);
        } else if(l.multiplier === VM.LM_SUM || l.multiplier === VM.LM_MEAN) {
          // Level for `bt` counts as first value.
          let count = 1;
          // NOTE: Link delay may be < 0!
          if(ld < 0) {
            // NOTE: Actual levels beyond the chunk length are undefined,
            // and should be ignored while summing / averaging.
            if(ci >= cbl) pl = 0;
            // If so, take sum over t, t+1, ..., t+(d-1).
            for(let j = ld + 1; j <= 0; j++) {
              // Again: only consider levels up to the end of the chunk.
              if(ci - j < cbl) {
                const spl = p.actualLevel(b - j);
                pl = this.severestIssue([pl, spl], pl + spl);
                count++;
              }
            }
          } else {
            // If d > 0, take sum over t, t-1, ..., t-(d-1).
            for(let j = 0; j < ld; j++) {
              // NOTE: Actual levels before t=0 are considered equal to
              // the initial level, and hence should NOT be ignored.
              const spl = p.actualLevel(b - j);
              pl = this.severestIssue([pl, spl], pl + spl);
              count++;
            }
          }
          if(l.multiplier === VM.LM_MEAN && count > 1) {
            // Average if more than 1 values have been summed.
            pl = this.keepException(pl, pl / count);
          }
        } else if(l.multiplier === VM.LM_THROUGHPUT) {
          // NOTE: calculate throughput on basis of levels and rates,
          // as not all actual flows may have been computed yet
          pl = 0;
          for(const ll of p.inputs) {
            const
                ipl = ll.from_node.actualLevel(bt),
                rr =  ll.relative_rate.result(bt); 
            pl = this.severestIssue([pl, ipl, rr], pl + ipl * rr);
          }
        } else if(l.multiplier === VM.LM_PEAK_INC) {
          // Actual flow over "peak increase" link is zero unless...
          if(i === 0) {
            // first time step, then "block peak increase"...
            pl = p.b_peak_inc[block];
          } else if(i === MODEL.block_length) {
            // ... or first step of look-ahead, then "additional increase".
            pl = p.la_peak_inc[block];
          } else {
            pl = 0;
          }
        }
        // Preserve special values such as INF, UNDEFINED and VM error codes.
        let rr = l.relative_rate.result(bt);
        if(p.grid && !l.to_node.is_data) {
          // For grid processes, rates depend on losses, which depend on
          // the process level, and whether the link is P -> Q or Q -> P.
          rr = 1;
          if(p.grid.loss_approximation > 0 && !MODEL.ignore_power_losses &&
              ((pl > 0 && p === l.from_node) ||
                  (pl < 0 && p === l.to_node))) {
            const alr = p.actualLossRate(bt);
            rr = 1 - alr;
            p.grid.total_losses += alr * Math.abs(pl);
          }
        }
        const af = this.severestIssue([pl, rr], rr * pl);
        // NOTE: Round near-zero actual flows to exactly 0.
        l.actual_flow[b] = (Math.abs(af) > VM.NEAR_ZERO ? af : 0);
        // This means that testing whether flow > 0, flow < 0, or =/= 0, this
        // need not be done with VM.NEAR_ZERO.
      }
    }
    // Report power losses per grid, if applicable.
    if(MODEL.with_power_flow && !MODEL.ignore_power_losses) {
      const ll = [];
      for(let k in MODEL.power_grids) if(MODEL.power_grids.hasOwnProperty(k)) {
        const pg = MODEL.power_grids[k];
        if(pg.loss_approximation > 0) {
          const
              atf = pg.total_flows / cbl,
              atl = pg.total_losses / cbl,
              perc = (atf <= VM.NEAR_ZERO ? '' :
                  [' (', (100 * atl / atf).toPrecision(3), '% of ',
                      VM.sig4Dig(atf), ' ', pg.power_unit, ')'].join(''));
          ll.push(`${pg.name}: ${VM.sig4Dig(atl)} ${pg.power_unit} ${perc}`);
        }
      }
      if(ll.length) {
        this.logMessage(block, 'Average power grid losses per time step:\n ' +
            ll.join('\n ') + '\n');
      }
    }

    // THEN: Calculate cash flows one step at a time because of delays.
    for(let i = 0; i < cbl; i++) {
      const b = bb + i;
      // Initialize cumulative cash flows for clusters.
      for(let k in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(k) &&
          !MODEL.ignored_entities[k]) {
        const c = MODEL.clusters[k];
        c.cash_in[b] = 0;
        c.cash_out[b] = 0;
        c.cash_flow[b] = 0;
      }
      // NOTE: Cash flows ONLY result from processes.
      for(let k in MODEL.processes) if(MODEL.processes.hasOwnProperty(k) &&
          !MODEL.ignored_entities[k]) {
        const p = MODEL.processes[k];
        let ci = 0,
            co = 0;
        // INPUT links from priced products generate cash OUT...
        for(const l of p.inputs) {
          // NOTE: Input links do NOT have a delay.
          const
              af = l.actual_flow[b],
              fnp = l.from_node.price;
          if(af && fnp.defined) {
            const pp = fnp.result(b);
            if(pp > 0 && pp < VM.PLUS_INFINITY) {
              co += pp * af;
            // ... unless the product price is negative; then cash IN.
            } else if(pp < 0 && pp > VM.MINUS_INFINITY) {
              ci -= pp * af;
            }
          }
        }
        // OUTPUT links to priced products generate cash IN ...
        for(const l of p.outputs) {
          // NOTE: actualFlows already consider delay!
          const
              af = l.actualFlow(b),
              tnp = l.to_node.price;
          // NOTE: Actual flow may be negative, and will be exactly 0 even
          // when computed as near-zero.
          if(af && tnp.defined) {
            // NOTE: Use the price at the time of the actual flow.
            const
                pp = tnp.result(b),
                cf = pp * af;
            // NOTE: Actual flows can be negative.
            if(cf > 0 && cf < VM.PLUS_INFINITY) {
              ci += cf;
            // ... unless the product price is negative; then cash OUT.
            } else if(cf < 0 && cf > VM.MINUS_INFINITY) {
              co -= cf;
            }
          }
        }
        // Cash flows of process p are now known.
        p.cash_in[b] = ci;
        p.cash_out[b] = co;
        const
            cf = ci - co,
            apl = Math.abs(p.level[b]);
        p.cash_flow[b] = cf;
        // Marginal cash flow is considered 0 when process level = 0.
        p.marginal_cash_flow[b] = (apl < VM.NEAR_ZERO ? 0 : cf / apl);
        // Also add these flows to all parent clusters of the process.
        let c = p.cluster;
        while(c) {
          c.cash_in[b] += ci;
          c.cash_out[b] += co;
          c.cash_flow[b] += cf;
          c = c.cluster;
        }
      }
    }
    
    // THEN: If cost prices should be inferred, calculate them one step
    // at a time because of delays, and also because expressions may refer
    // to values for earlier time steps.
    if(MODEL.infer_cost_prices) {
      for(let i = 0; i < cbl; i++) {
        const b = bb + i;
        MODEL.calculateCostPrices(b);
      }
    }

    // THEN: Reset all datasets that are outcomes or serve as "formulas".
    for(let k in MODEL.datasets) if(MODEL.datasets.hasOwnProperty(k)) {
      const ds = MODEL.datasets[k];
      // NOTE: Assume that datasets having modifiers but no data serve as
      // "formulas", i.e., expressions to be calculated AFTER a model run.
      // This will automatically include the equations dataset.
      if(ds.outcome || ds.data.length === 0) {
        for(let m in ds.modifiers) if(ds.modifiers.hasOwnProperty(m)) {
          ds.modifiers[m].expression.reset();
        }
      }
    }

    // THEN: Reset the vectors of all chart variables.
    for(const c of MODEL.charts) c.resetVectors();
    
    // Update the chart dialog if it is visible.
    // NOTE: Do NOT do this while an experiment is running, as this may
    // interfere with storing the run results.
    if(!MODEL.running_experiment) {
      if(CHART_MANAGER.visible) CHART_MANAGER.updateDialog();
    }
    
    // NOTE: Add a blank line to separate from next round (if any).
    this.logMessage(block,
        `Calculating dependent variables took ${this.elapsedTime} seconds.\n`);

    // FINALLY: Reset the vectors of all note colors.
    for(let k in MODEL.clusters) if(MODEL.clusters.hasOwnProperty(k)) {
      const c = MODEL.clusters[k];
      for(const n of c.notes) n.color.reset();
    }
  }
  
  showSetUpProgress(next_start, abl) {
    if(this.show_progress) {
      // Display 1 more segment progress so that the bar reaches 100%
      UI.setProgressNeedle((next_start + this.tsl) / abl);
    }
    setTimeout((t, n) => { VM.addTableauSegment(t, n); }, 0, next_start, abl);
  }

  hideSetUpOrWriteProgress() {
    this.show_progress = false;
    UI.setProgressNeedle(0);
  }
  
  logCode() {
    // Print VM instructions to console.
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
        return '(' + a.map((x) => arg(x)).join(', ') + ')';
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
    const abl = this.actualBlockLength(this.block_count);
    // NOTE: Tableau segment length is the number of time steps between
    // updates of the progress needle. The default progress needle interval
    // is calibrated for 1000 VMI instructions.
    this.tsl = Math.ceil(CONFIGURATION.progress_needle_interval *
        1000 / this.code.length);
    if(abl > this.tsl * 5) {
      UI.setMessage('Constructing the Simplex tableau');
      UI.setProgressNeedle(0);
      this.show_progress = true;
    } else {
      this.show_progress = false;
    }
    // Assume no warnings or errors for this block.
    this.error_count = 0;
    setTimeout((n) => VM.initializeTableau(n), 0, abl);
  }
  
  resetTableau() {
    // Clears tableau data: matrix, rhs and constraint types.
    // NOTE: This reset is called when initializing, and to free up
    // memory after posting a block to the server.
    this.matrix.length = 0;
    this.right_hand_side.length = 0;
    this.constraint_types.length = 0;
  }
  
  initializeTableau(abl) {
    // `offset` is used to calculate the actual column index for variables.
    this.offset = 0;
    // NOTE: Vectors are "sparse" (i.e., will contain many 0) and are hence
    // not represented as arrays but as objects, e.g., {4:1.5, 8:0.3} to
    // represent an array [0, 0, 0, 1.5, 0, 0, 0, 0.3, 0, 0, 0, ...].
    // The keys can span the full chunk, so the objects represent vectors
    // that have a "virtual length" of cols * abl.
    this.coefficients = {};
    this.rhs = 0;
    // NOTE: VM needs separate "registers" for cash IN and cash OUT
    // coefficients and RHS because the direction of the cash flow is
    // dynamic.
    this.cash_in_coefficients = {};
    this.cash_in_rhs = 0;
    this.cash_out_coefficients = {};
    this.cash_out_rhs = 0;
    // NOTE: Cash flow equation coefficients may be divided by a scalar to
    // keep them amply below the base slack penalty; the scalar is increased
    // by the VM instruction VMI_add_cash_constraints so that at the end of
    // the block setup it equals the highest absolute coefficient in the
    // cash flow constraint equations. The VM maintains a list of indices
    // of matrix rows that then need to be scaled.
    this.cash_scalar = 1;
    this.cash_constraints = [];
    // NOTE: The model may contain data products that represent a cash
    // flow property of an actor. To calculate the actual value of such
    // properties, the coefficients in the effectuating constraint must
    // be *multiplied* by the scalar to compensate for the downscaling
    // explained above.
    this.actor_cash_constraints = [];
    // Vector for the objective function coefficients.
    this.objective = {};
    // Vectors for the bounds on decision variables.
    this.lower_bounds = {};
    this.upper_bounds = {};
    // Clear the tableau matrix and constraint type and RHS columns.
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
    // Set list with indices of semi-continuous variables.
    this.is_semi_continuous = {};
    // NOTE: Solver may not support semi-continuous variables.
    if(!this.noSemiContinuous) {
      for(let i in this.sec_var_indices) if(Number(i)) {
        for(let j = 0; j < abl; j++) {
          this.is_semi_continuous[parseInt(i) + j*this.cols] = true;
        }
      }
    }
    // Execute code for each time step in this block.
    this.logTrace('START executing block code (' +
        pluralS(this.code.length, ' instruction)'));
    // NOTE: `t` is the VM's "time tick", which is "relative time" compared
    // to the "absolute time" of the simulated period. VM.t always starts
    // at 1, which corresponds to MODEL.start_period.
    this.t = (this.block_count - 1) * MODEL.block_length + 1;
    // Show this relative (!) time step on the status bar as progress
    // indicator.
    UI.updateTimeStep(this.t);
    setTimeout((t, n) => VM.addTableauSegment(t, n), 0, 0, abl);
  }
  
  addTableauSegment(start, abl) {
    if(this.halted) {
      this.hideSetUpOrWriteProgress();
      this.stopSolving();
      return;
    }
    // NOTE: Save an additional call when less than 20% of a segment would
    // remain.
    var l;
    const next_start = (start + this.tsl * 1.2 < abl ? start + this.tsl : abl);
    for(let i = start; i < next_start; i++) {
      this.executing_tableau_code = true;
      this.logTrace('EXECUTE for t=' + this.t);
      l = this.code.length;
      for(let j = 0; j < l; j++) {
        this.IP = j;
        // Execute the instruction, which has form [function, argument list].
        const instr = this.code[j];
        instr[0](instr[1]);
        // Trace the result when debugging.
        this.logTrace([('    ' + j).slice(-5), ': coeff = ',
            JSON.stringify(this.coefficients), ';  rhs = ', this.rhs].join(''));
      }
      this.executing_tableau_code = false;
      this.logTrace('STOP executing block code');
      // Add constraints for paced process variables.
      // NOTE: This is effectuated by *executing* VM instructions.
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
      // Proceed to the next time tick.
      this.t++;
      // This also means advancing the offset, because all VM instructions
      // pass variable indices relative to the first column in the tableau.
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
    // the "base" slack penalty.
    this.scaleObjective();
    this.scaleCashFlowConstraints();
    // Add (appropriately scaled!) slack penalties to the objective function
    // NOTE: penalties must become negative coefficients (solver MAXimizes!)
    let p = -1,
        hsp = 0;
    // Three types of slack variable: market demand (EQ),
    // LE and GE bound constraints and highest (data, composite constraints)
    for(const svl of this.slack_variables) {
      for(const sv of svl) {
        for(let k = 0; k < abl; k++) {
          hsp = this.slack_penalty * p;
          this.objective[sv + k*this.cols] = hsp;
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
  
  actualBlockLength(block) {
    // The actual block length is the number of time steps to be considered
    // by the solver; the abl of the last block is likely to be shorter
    // than the standard, as it should not go beyond the end time plus
    // look-ahead.
    if(block < this.nr_of_blocks) return this.chunk_length;
    // Last block length equals remainder of simulation period divided
    // by block length.
    let rem = (MODEL.runLength - MODEL.look_ahead) % MODEL.block_length;
    // If this remainder equals 0, the last block is a full chunk.
    if(rem === 0) return this.chunk_length;
    // Otherwise, the last block has remainder + look-ahead time steps.
    return rem + MODEL.look_ahead;
  }
  
  setNumericIssue(n, p, where) {
    let vbl;
    if(p >= this.chunk_offset) {
      vbl = this.chunk_variables[p - this.chunk_offset];
    } else {
      // NOTE: `variables` is zero-based, hence p-1.
      vbl = this.variables[(p-1) % this.cols];
    }
    this.numeric_issue = where + ' for ' + vbl[1].name +
        ' (' + vbl[0] + ', bt=' + Math.floor((p-1) / this.cols + 1) + ') ';
    // NOTE: Numeric issues may be detected on negated values, because
    // coefficients may be transformed algebraically. Exception and
    // error codes are extremely high + or - values => negate them when
    // they exceed the negated exception or error threshold.
    if(n <= -VM.EXCEPTION || n >= -VM.ERROR) n = -n;
    const msg = ['Tableau error: ', this.numeric_issue, ' - ',
        this.errorMessage(n), ' (value = ', this.sig2Dig(n), ')'].join('');
    this.logMessage(this.block_count, msg);
    UI.alert(msg);
  }
  
  get columnsInBlock() {
    // Return the chunk length plus the number of chunk variables.
    return this.chunk_length * this.cols + this.chunk_variables.length;
  }
  
  addNodeToFixate(n, bt, level) {
    // Record that level of node `n` must be fixated for block time `bt`
    // in the next block by setting it to the specified level.
    const
        vi = n.level_var_index,
        pos = n.plus_var_index,
        off = n.is_zero_var_index,
        neg = n.minus_var_index;
    if(!this.variables_to_fixate.hasOwnProperty(vi)) {
      this.variables_to_fixate[vi] = {};
    }
    this.variables_to_fixate[vi][bt] = level;
    if(off >= 0) {
      if(!this.variables_to_fixate.hasOwnProperty(off)) {
        this.variables_to_fixate[off] = {};
      }
      if(!this.variables_to_fixate.hasOwnProperty(pos)) {
        this.variables_to_fixate[pos] = {};
      }
      if(!this.variables_to_fixate.hasOwnProperty(neg)) {
        this.variables_to_fixate[neg] = {};
      }
      let plus = 0,
          zero = 0,
          minus = 0;
      if(level >= ON_OFF_THRESHOLD) {
        plus = 1;
      } else if(level <= -ON_OFF_THRESHOLD) {
        minus = 1;
      } else {
        zero = 1;
      }
      this.variables_to_fixate[off][bt] = zero;
      this.variables_to_fixate[pos][bt] = plus;
      this.variables_to_fixate[neg][bt] = minus;
    }
  }
  
  writeLpFormat(cplex=false, named_constraints=false) {
    // NOTE: Up to version 1.5.6, actual block length of last block used
    // to be shorter than the chunk length so as not to go beyond the
    // simulation end time. The look-ahead is now *always* part of the
    // chunk, even if this extends beyond the simulation period. The
    // model is expected to provide the necessary data. The former model
    // behavior can still be generated by limiting time series length to
    // the simulation period.
    const
        abl = this.actualBlockLength(this.block_count),
        // Get the number digits for variable names.
        z = this.columnsInBlock.toString().length,
        // LP_solve uses semicolon as separator between equations.
        EOL = (cplex ? '\n' : ';\n'),
        // Local function that returns variable symbol (e.g. X001) with
        // its coefficient if specified (e.g., -0.123 X001) in the
        // most compact notation.
        vbl = (index, c=false) => {
            const v = 'X' + index.toString().padStart(z, '0');
            if(c === false) return v; // Only the symbol
            if(c === -1) return ` -${v}`; // No coefficient needed
            if(c < 0) return ` ${c} ${v}`; // Number had minus sign
            if(c === 1) return ` +${v}`; // No coefficient needed
            return ` +${c} ${v}`; // Prefix coefficient with +
            // NOTE: This may return  +0 X001.
          };
    this.numeric_issue = '';
    // First add the objective (always MAXimize).
    if(cplex) {
      this.lines = `\\${this.solver_id}\nMaximize\n`;
    } else {
      this.lines = '/* Objective function */\nmax:\n';
    }
    let c,
        p,
        v,
        line = '';
    // NOTE: Iterate over ALL columns to maintain variable order.
    let n = abl * this.cols + this.chunk_variables.length;
    for(p = 1; p <= n; p++) {
      if(this.objective.hasOwnProperty(p)) {
        c = this.objective[p];
        // Check for numeric issues.
        if (c < VM.MINUS_INFINITY || c > VM.PLUS_INFINITY) {
          this.setNumericIssue(c, p, 'objective function coefficient');
          break;
        }
        line += vbl(p, c);
      }
      // Keep lines under approx. 110 chars.
      if(line.length >= 100) {
        this.lines += line + '\n';
        line = '';
      }
    }
    this.lines += line + EOL;
    line = '';
    // Add the row constraints.
    if(cplex) {
      this.lines += '\nSubject To\n';
    } else {
      this.lines += '\n/* Constraints */\n';
    }
    n = this.matrix.length;
    for(let r = 0; r < n; r++) {
      const row = this.matrix[r];
      if(named_constraints) line = `C${r + 1}: `;
      for(p in row) if (row.hasOwnProperty(p)) {
        c = row[p];
        if (c < VM.SOLVER_MINUS_INFINITY || c > VM.SOLVER_PLUS_INFINITY) {
          console.log('INVALID COEFFICIENT\n', this.lines, 'row', r, 'column', p, row);
          this.setNumericIssue(c, p, 'constraint coefficient');
          break;
        }
        line += vbl(p, c);
        // Keep lines under approx. 110 chars.
        if(line.length >= 100) {
          this.lines += line + '\n';
          line = '';
        }
      }
      c = this.right_hand_side[r];
      // NOTE: When previous block was infeasible or unbounded (no solution),
      // expressions for RHS may not evaluate as a number.
      if(Number.isNaN(c)) {
        this.setNumericIssue(c, r, 'constraint RHS');
        c = 0;
      }
      this.lines += line + ' ' +
          this.constraint_symbols[this.constraint_types[r]] + ' ' + c + EOL;
      line = '';
    }
    // Add the variable bounds.
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
        // NOTE: For bounds, use the SOLVER values for +/- Infinity.
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
      v = vbl(p);
      if(lb === ub) {
        line = (lb !== null ? ` ${v} = ${lb}` : '');
      } else {
        const
            lbfree = (lb === null || lb <= VM.SOLVER_MINUS_INFINITY),
            ubfree = (ub === null || ub >= VM.SOLVER_PLUS_INFINITY);
        // NOTE: By default, lower bound of variables is 0.
        if(cplex && lbfree && ubfree) {
            line = ` ${v} ${this.is_binary[p] ? '<= 1' : 'free'}`;
        } else {
          // Bounds can be specified on a single line: lb <= X001 <= ub.
          if(lb || lb === 0) {
            line = ` ${lb} <= ${v}${ubfree ? '' : ' <= ' + ub}`;
          } else {
            line = (ubfree ? '' : ` ${v} <= ${ub}`);
          }
        }
      }
      if(line) this.lines += line + EOL;
    }
    // Add the special variable types.
    if(cplex) {
      line = '';
      let scv = 0,
          vcnt = 0;
      for(let i in this.is_binary) if(Number(i)) {
        line += ' ' + vbl(i);
        scv++;
        vcnt++;
        // Max. 10 variables per line.
        if(vcnt >= 10) {
          line += '\n';
          vcnt = 0;
        }
      }
      if(scv) {
        this.lines += `Binary\n${line}\n`;
        line = '';
        scv = 0;
        vcnt = 0;
      }
      for(let i in this.is_integer) if(Number(i)) {
        line += ' ' + vbl(i);
        scv++;
        vcnt++;
        // Max. 10 variables per line.
        if(vcnt >= 10) {
          line += '\n';
          vcnt = 0;
        }
      }
      if(scv) {
        this.lines += `General\n${line}\n`;
        line = '';
        scv = 0;
        vcnt = 0;
      }
      for(let i in this.is_semi_continuous) if(Number(i)) {
        line += ' '+ vbl(i);
        scv++;
        vcnt++;
        // Max. 10 variables per line.
        if(vcnt >= 10) {
          line += '\n';
          vcnt = 0;
        }
      }
      if(scv) {
        this.lines += `Semi-continuous\n${line}\n`;
        line = '';
        scv = 0;
      }
      // NOTE: Add SOS section only if the solver supports SOS.
      if(this.sos_var_indices.length > 0 && !this.noSupportForSOS) {
        this.lines += 'SOS\n';
        const v_set = [];
        for(let j = 0; j < abl; j++) {
          for(let i = 0; i < this.sos_var_indices.length; i++) {
            const svi = this.sos_var_indices[i];
            v_set.length = 0;
            let vi = svi[0] + j * this.cols;
            for(let j = 1; j <= svi[1]; j++)  {
              v_set.push(`${vbl(vi)}:${j}`);
              vi++;
            }
            this.lines += ` s${i}: S2:: ${v_set.join(' ')}\n`;
          }
        }
      }
      this.lines += 'End';
    } else {
      // Follow LP_solve conventions.
      // NOTE: LP_solve does not differentiate between binary and integer,
      // so for binary variables, the constraint <= 1 must be added.
      const v_set = [];
      for(let i in this.is_binary) if(Number(i)) {
        const v = vbl(i);
        this.lines += `${v} <= 1;\n`;
        v_set.push(v);
      }
      for(let i in this.is_integer) if(Number(i)) v_set.push(vbl(i));
      if(v_set.length > 0) this.lines += 'int ' + v_set.join(', ') + ';\n';
      // Clear the INT variable list.
      v_set.length = 0;
      // Add the semi-continuous variables.
      for(let i in this.is_semi_continuous) if(Number(i)) v_set.push(vbl(i));
      if(v_set.length > 0) this.lines += 'sec ' + v_set.join(', ') + ';\n';
      // LP_solve supports SOS, so add the SOS section if needed.
      if(this.sos_var_indices.length > 0) {
        this.lines += 'sos\n';
        for(let j = 0; j < abl; j++) {
          for(const svi of this.sos_var_indices) {
            v_set.length = 0;
            let vi = svi[0] + j * this.cols;
            for(let j = 1; j <= svi[1]; j++)  {
              v_set.push(vbl(vi));
              vi++;
            }
            this.lines += `SOS${sos}: ${v_set.join(',')} <= 2;\n`;
          }
        }
      }
    }
    setTimeout(() => VM.submitFile(), 0);
  }
  
  rowToEquation(row, ct, rhs) {
    const eq = [];
    for(let i in row) if (isNumber(i)) {
      const
          c = this.sig4Dig(row[i]),
          vi = i % this.cols,
          t = Math.floor(i / this.cols);
      eq.push(c + ' ' + this.variables[vi][1].displayName + ' ' +
        this.variables[vi][0] + ' [' + t + ']');
    }
    return eq.join(' + ') + ct + ' ' + this.sig4Dig(rhs);
  }

  writeMPSFormat() {
    // Write model code lines in MPS format. This format is column-based
    // instead of row-based, hence for each column a separate string list.
    // NOTE: Columns are numbered from 1 to N, hence a dummy list for c=0.
    const
        abl = this.actualBlockLength(this.block_count),
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
    // Start with the "free" row that will be the objective function.
    this.lines += ' N  OBJ\n';
    for(r = 0; r < nrow; r++) {
      const
          row = this.matrix[r],
          row_lbl = 'R' + (r + 1).toString().padStart(this.decimals, '0');
      this.lines += ' ' + this.constraint_letters[this.constraint_types[r]] +
          '  ' + row_lbl + '\n';
      for(p in row) if (row.hasOwnProperty(p)) {
        c = row[p];
        // Check for numeric issues.
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
    // The objective function is a row like those for the constraints.
    for(p in this.objective) if(this.objective.hasOwnProperty(p)) {
      c = this.objective[p];
      if(c === null || c < VM.MINUS_INFINITY || c > VM.PLUS_INFINITY) {
        this.setNumericIssue(c, p, 'objective function coefficient');
        break;
      }
      // NOTE: MPS assumes MINimization, hence negate all coefficients.
      // NOTE: JavaScript differentiates between 0 and -0, so add 0 to
      // prevent creating the special numeric value -0.
      cols[p].push('OBJ ' + (-c + 0));
    }
    // Abort if any invalid coefficient was detected.
    if(this.numeric_issue) {
      this.hideSetUpOrWriteProgress();
      this.stopSolving();
      return;
    }
    // Add the columns section.
    this.lines += 'COLUMNS\n';
    for(c = 1; c <= ncol; c++) {
      const col_lbl = '    X' + c.toString().padStart(this.decimals, '0') + '  ';
      // NOTE: If processes have no in- or outgoing links their decision
      // variable does not occur in any constraint, and this may cause
      // problems for solvers that cannot handle columns having a blank
      // row name (e.g., CPLEX). To prevent errors, these columns are
      // given coefficient 0 in the OBJ row.
      if(cols[c].length) {
        this.lines += col_lbl + cols[c].join('\n' + col_lbl) + '\n';
      } else {
        this.lines += col_lbl + ' OBJ 0\n';
      }
    }
    // Free up memory.
    cols.length = 0;
    // Add the RHS section.
    this.lines += 'RHS\n' + rhs.join('\n') + '\n';
    rhs.length = 0;
    // Add the BOUNDS section.
    this.lines += 'BOUNDS\n';
    // NOTE: Start at column number 1, not 0.
    setTimeout((c, n) => VM.showMPSProgress(c, n), 0, 1, ncol);
  }
  
  showMPSProgress(next_col, ncol) {
    if(VM.halted) {
      this.hideSetUpOrWriteProgress();
      this.stopSolving();
      return;
    }
    if(this.show_progress) {
      // NOTE: Display 1 block more progress, or the bar never reaches 100%.
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
        // NOTE: For bounds, use the SOLVER values for +/- Infinity.
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
        // Assume "standard" bounds.
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
        // NOTE: by default, lower bound of variables is 0.
        if(lb !== null && lb !== 0 || lbc !== ' LO') {
          this.lines += lbc + bnd + lb + '\n';
        }
        if(ub !== null) {
          this.lines += ubc + bnd + ub + '\n';
        }
      }
    }
    // Abort if any invalid coefficient was detected.
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
    // Add the SOS section.
    if(this.sos_var_indices.length > 0) {
      this.lines += 'SOS\n';
      const abl = this.actualBlockLength(this.block_count);
      for(let j = 0; j < abl; j++) {
        for(let i = 0; i < this.sos_var_indices.length; i++) {
          const svi = this.sos_var_indices[i];
          this.lines += ` S2 sos${i + 1}\n`;
          let vi = svi[0] + j * this.cols;
          for(let j = 1; j <= svi[1]; j++) {
            const s = '    X' +
                vi.toString().padStart(this.decimals, '0') +
                '          ';
            this.lines += s.substring(0, 15) + j + '\n';
            vi++;
          }
        }
      }
    }
    // Add the end-of-model marker.
    this.lines += 'ENDATA';
    setTimeout(() => VM.submitFile(), 0);
  }
  
  checkLicense() {
    // Compare license expiry date (if set) with current time, and notify
    // when three days or less remain.
    if(this.license_expires && this.license_expires.length) {
      // NOTE: Expiry date has YYYY-MM-DD format.
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
            opts = {weekday: 'long', year: 'numeric', month: 'long',
                day: 'numeric'},
            lds = ' (' + xdate.toLocaleDateString(undefined, opts) + ')';
        UI.notify('Solver license will expire in less than 3 days' + lds);
      }
    }
  }

  stopSolving() {
    // Wrap-up after solving is completed or aborted.    
    this.stopTimer();
    // Stop rotating the Linny-R icon, and update buttons.
    UI.stopSolving();
  }
  
  processServerResponse(json) {
    // Response object (parsed JSON) has these properties:
    // - error: error message (empty string => OK)
    // - status: the solver exit code
    // - model: the MILP equations in LP format
    // - data: data object {block, round, x}
    let msg = '';
    // NOTE: Block number is passed as string => convert to integer.
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
      // Check whether Gurobi version is at least version 9.5.
      let gv = msg.match(/Gurobi \d+\.\d+\.\d+/);
      if(gv) {
        gv = gv[0].split(' ')[1].split('.');
        const major = parseInt(gv[0]);
        if(major < 9 || (major === 9 && parseInt(gv[1]) < 5)) {
          UI.alert('Gurobi version is too old -- upgrade to 9.5 or higher');
        }
      }
      // NOTE: Server script adds a license expiry notice for the Gurobi
      // solver.
      this.license_expires = msg.match(/ expires \d{4}\-\d{2}\-\d{2}/);
    }
    if(json.error) {
      const errmsg = 'Solver error: ' + json.error;
      if(errmsg.indexOf('license') >= 0 && errmsg.indexOf('expired') >= 0) {
        this.license_expired += 1;
      }
      this.logMessage(bnr, errmsg);
      UI.alert(errmsg);
      if(errmsg.indexOf('nfeasible') >= 0 || errmsg.indexOf('nbounded') >= 0) {
        this.prompt_to_diagnose = true;
      }
    }
    this.logMessage(bnr, msg);
    this.equations[bnr - 1] = json.model;
    if(DEBUGGING) console.log(json.data);
    // Store the results in the decision variable vectors (production
    // levels and stock level), but do NOT overwrite "look-ahead" levels
    // if this block was not solved (indicated by the 4th parameter that
    // tests the status).
    try {
      this.setLevels(bnr, rl, json.data.x, !json.solution);
      // NOTE: Post-process levels only AFTER the last round!
      if(rl === this.lastRound) {
        // Calculate data for all other dependent variables.
        this.calculateDependentVariables(bnr);    
        // Add progress bar segment only now, knowing status AND slack use.
        const issue = json.status !== 0 || this.error_count > 0;
        if(issue) this.block_issues++;
        // NOTE: in case of multiple rounds, use the sum of the round times.
        const time = this.round_times.reduce((a, b) => a + b, 0);
        this.round_times.length = 0;
        this.solver_times[bnr - 1] = time;
        const ssecs = this.round_secs.reduce((a, b) => a + b, 0);
        this.solver_secs[bnr - 1] = (ssecs ? VM.sig4Dig(ssecs) : '0');
        this.round_secs.length = 0;
        MONITOR.addProgressBlock(bnr, issue, time);
      }
    } catch(err) {
      const msg = `ERROR while processing solver data for block ${bnr}: ${err}`;
      console.log(msg);      
      this.logMessage(bnr, msg);
      UI.alert(msg);
      this.stopSolving();
      this.halted = true;
    }
    // Free up memory.
    json = null;
  }

  solveBlocks() {
    // Check if blocks remain to be done. If not, redraw the graph and exit.
    // NOTE: Set IF-condition to TRUE for testing WITHOUT computation.
    if(this.halted || this.block_count > this.nr_of_blocks) {
      // Set current time step to 1 (= first time step of simulation period).
      MODEL.t = 1;
      this.stopSolving();
      MODEL.solved = true;
      this.checkLicense();
      UI.drawDiagram(MODEL);
      // Show the reset button (GUI only).
      UI.readyToReset();
      if(MODEL.running_experiment) {
       // If experiment is active, signal the manager.
        EXPERIMENT_MANAGER.processRun();
      } else if(RECEIVER.solving || MODEL.report_results) {
        // Otherwise report results now, if applicable.
        RECEIVER.report();
      }
      // Warn modeler if any issues occurred.
      if(this.prompt_to_diagnose && !this.diagnose) {
        UI.warn('Model is infeasible or unbounded -- ' +
            '<strong>Alt</strong>-click on the <em>Run</em> button ' +
            '<img id="solve-btn" class="sgray" src="images/solve.png">' +
            ' for diagnosis');
      } else if(this.block_issues) {
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
        // Special message to draw attention to this critical error.
        UI.alert('SOLVER LICENSE EXPIRED: Please check!');
      }
      // Call back to the console (if callback hook has been set).
      if(this.callback) this.callback(this);
      return;
    }
    const
        bwr = this.blockWithRound,
        fromt = (this.block_count - 1) * MODEL.block_length + 1,
        abl = this.actualBlockLength(this.block_count);
    MONITOR.updateBlockNumber(bwr);
    // NOTE: Add blank line to message to visually separate rounds.
    this.logMessage(this.block_count, ['\nSetting up block #', bwr,
        ' (t=', fromt, '-', fromt + abl - 1, '; ',
        pluralS(abl, 'time step'), ')'].join(''));
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
    // If negative delays require "fixating" variables for some number
    // of time steps, this must be logged in the monitor.
    let keys = Object.keys(this.variables_to_fixate);
    if(keys.length) {
      const msg = ['NOTE: Due to negative link delays, levels for ' +
            pluralS(keys.length, 'variable') + ' are pre-set:'];
      for(const k of keys) {
        const
            vi = parseInt(k),
            // NOTE: Subtract 1 because variable list is zero-based.
            vbl = this.variables[vi - 1], 
            fv = this.variables_to_fixate[vi],
            fvk = Object.keys(fv),
            fvl = [];
        // Add constraints that fixate the levels directly to the tableau.
        for(const bt of fvk) {
          const
              pl = fv[bt],
              k = (bt - 1) * VM.cols + vi,
              row = {};
          row[k] = 1;
          VM.matrix.push(row);
          VM.right_hand_side.push(pl);
          VM.constraint_types.push(VM.EQ);
          fvl.push(pl + ' for bt=' + bt);
        }
        msg.push(`- ${vbl[1].displayName} [${vbl[0]}]: ${fvl.join(', ')}`);
      }
      this.logMessage(this.block_count, msg.join('\n'));
    }
    // Convert bound issues to warnings in the Monitor.
    keys = Object.keys(this.bound_issues).sort();
    const n = keys.length;
    if(n) {
      let vlist = '',
          first = 1e20;
      for(const k of keys) {
        const bit = this.bound_issues[k];
        vlist += `\n   - ${k} (t=${listToRange(bit)})`;
        first = Math.min(first, bit[0]);
      }
      const msg = `Lower bound exceeds upper bound for ${n} processes`;
      this.logMessage(this.block_count,
          `${this.WARNING}(t=${first}) ${msg}:${vlist}`);
      UI.warn(msg + ' - check Monitor for details');
      // Clear bound issue dictionary, so next block starts anew.
      this.bound_issues = {};
    }
    // Create the input file for the solver.
    this.logMessage(this.block_count,
        'Creating model for block #' + this.blockWithRound);
    this.cbl = CONFIGURATION.progress_needle_interval * 200;
    if(this.cols * MODEL.block_length > 5 * this.cbl) {
      UI.setProgressNeedle(0);
      this.show_progress = true;
    } else {
      this.show_progress = false;
    }
    // Generate lines of code in format that should be accepted by solver.
    if(this.solver_id === 'gurobi') {
      this.writeLpFormat(true);
    } else if(this.solver_id === 'mosek') {
      // NOTE: For MOSEK, constraints must be named, or variable names
      // in solution file will not match.
      this.writeLpFormat(true, true);
    } else if(this.solver_id === 'cplex' || this.solver_id === 'scip') {
      // NOTE: The more widely accepted CPLEX LP format differs from the
      // LP_solve format that was used by the first versions of Linny-R.
      // TRUE indicates "CPLEX format".
      this.writeLpFormat(true);
    } else if(this.solver_id === 'lp_solve') {
      this.writeLpFormat(false);
    } else {
      const msg = `Cannot write LP format: invalid solver ID "${this.solver_id}"`;
      this.logMessage(this.block_count, msg);
      UI.alert(msg);
      this.stopSolving();
    }
  }  

  submitFile() {
    // Prepare to POST the model file (LP or MPS) to the Linny-R server.
    // NOTE: The tableau is no longer needed, so free up its memory.
    this.resetTableau();
    if(this.numeric_issue) {
      const msg = 'Invalid ' + this.numeric_issue;
      this.logMessage(this.block_count, msg);
      UI.alert(msg);
      this.stopSolving();
    } else {
      // Log the time it took to create the code lines.
      this.logMessage(this.block_count,
          'Model file creation (' + UI.sizeInBytes(this.lines.length) +
              ') took ' + this.elapsedTime + ' seconds.');
      // NOTE: Monitor will use (and then clear) VM.lines, so no need
      // to pass it on as parameter.
      MONITOR.submitBlockToSolver();
      // Now the round number can be increased...
      this.current_round++;
      // ... and also the blocknumber if all rounds have been played.
      if(this.current_round >= this.round_sequence.length) {
        this.current_round = 0;
        this.block_count++;
      }
    }
  }
  
  solve() {
    // Compile model to VM code; then start sequence of solving blocks.
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
  
  solveModel(diagnose=false) {
    // Start the sequence of data loading, model translation, solving
    // consecutive blocks, and finally calculating dependent variables.
    // NOTE: Do this only if the model defines a MILP problem, i.e.,
    // contains at least one process or product.
    if(!(Object.keys(MODEL.processes).length ||
        Object.keys(MODEL.products).length)) {
      UI.notify('Nothing to solve');
      return;
    }
    // Diagnosis (by adding slack variables and finite bounds on processes)
    // is activated when Alt-clicking the "run" button, or by clicking the
    // "clicke *here* to diagnose" link on the infoline.
    this.diagnose = diagnose || MODEL.always_diagnose;
    if(this.diagnose) {
      this.PLUS_INFINITY = this.DIAGNOSIS_UPPER_BOUND;
      this.MINUS_INFINITY = -this.DIAGNOSIS_UPPER_BOUND;
      this.NEAR_PLUS_INFINITY = this.DIAGNOSIS_UPPER_BOUND / 10;
      this.NEAR_MINUS_INFINITY = -this.DIAGNOSIS_UPPER_BOUND / 10;
      console.log('DIAGNOSIS ON');
    } else {
      this.PLUS_INFINITY = this.SOLVER_PLUS_INFINITY;
      this.MINUS_INFINITY = this.SOLVER_MINUS_INFINITY;
      this.NEAR_PLUS_INFINITY = this.SOLVER_PLUS_INFINITY / 200;
      this.NEAR_MINUS_INFINITY = this.SOLVER_MINUS_INFINITY / 200;
      console.log('DIAGNOSIS OFF');
    }
    // The "propt to diagnose" flag is set when some block posed an
    // infeasible or unbounded problem.
    this.prompt_to_diagnose = false;
    const n = MODEL.loading_datasets.length;
    if(n > 0) {
      // Still within reasonable time? (3 seconds per dataset)
      if(MODEL.max_time_to_load > 0) {
        // Report progress on the status bar (just plain text)
        UI.setMessage(`Waiting for ${pluralS(n, 'dataset')} to load`);
        // Decrease the remaining time to wait (half second units)
        MODEL.max_time_to_load--;
        // Try again after half a second.
        setTimeout(() => VM.solveModel(), 500);
        return;
      } else {
        // Wait no longer, but warn user that data may be incomplete.
        const dsl = [];
        for(const ds of MODEL.loading_datasets) dsl.push(ds.displayName);
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
    // Abort solving process. This prevents submitting the next block.
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
// parameter is omitted.

function VMI_push_number(x, number) {
  // Push a numeric constant on the VM stack.
  if(DEBUGGING) console.log('push number = ' + number);
  x.push(number);
}

function VMI_push_time_step(x) {
  // Push the current time step.
  // NOTE: This is the "local" time step for expression `x` (which always
  // starts at 1), adjusted for the first time step of the simulation period.
  const t = x.step[x.step.length - 1] + MODEL.start_period - 1; 
  if(DEBUGGING) console.log('push absolute t = ' + t);
  x.push(t);
}

function VMI_push_delta_t(x) {
  // Push the duration of 1 time step (in hours).
  const dt = MODEL.time_scale * VM.time_unit_values[MODEL.time_unit]; 
  if(DEBUGGING) console.log('push delta-t = ' + dt);
  x.push(dt);
}

function VMI_push_relative_time(x) {
  // Push the "local" time step for expression `x`.
  // NOTE: Time step for optimization period always starts at 1.
  const t = x.step[x.step.length - 1]; 
  if(DEBUGGING) console.log('push relative t = ' + t);
  x.push(t);
}

function VMI_push_block_time(x) {
  // Push the "local" time step for expression `x` (which always starts
  // at 1) adjusted for the first time step of the current block.
  const
      lt = x.step[x.step.length - 1] - 1,
      bnr = Math.floor(lt / MODEL.block_length),
      t = lt - bnr * MODEL.block_length + 1;
  if(DEBUGGING) console.log('push block time bt = ' + t);
  x.push(t);
}

function VMI_push_chunk_time(x) {
  // Push the time step for which the VM is preparing the tableau.
  // NOTE: Chunk time is meaningful only while the VM is solving a block.
  // If not, the block time is pushed.
  if(VM.executing_tableau_code) {
    const
        ct = VM.t - (VM.block_count - 1) * MODEL.block_length;
    if(DEBUGGING) console.log('push chunk time ct = ' + ct);
    x.push(ct);
  } else {
    if(DEBUGGING) console.log('push chunk time: NOT constructing tableau'); 
    VMI_push_block_time(x);    
  }
}

function VMI_push_block_number(x) {
  // Push the number of the block currently being optimized.
  // NOTE: Block numbering starts at 1.
  const local_t = x.step[x.step.length - 1] - 1,
        bnr = Math.floor(local_t / MODEL.block_length) + 1;
  if(DEBUGGING) console.log('push current block number = ' + bnr);
  x.push(bnr);
}

function VMI_push_run_length(x) {
  // Push the run length (excl. look-ahead!).
  const n = VM.nr_of_time_steps;
  if(DEBUGGING) console.log('push run length N = ' + n);
  x.push(n);
}

function VMI_push_block_length(x) {
  // Push the block length.
  if(DEBUGGING) console.log('push block length n = ' + MODEL.block_length);
  x.push(MODEL.block_length);
}

function VMI_push_look_ahead(x) {
  // Push the look-ahead.
  if(DEBUGGING) console.log('push look-ahead l = ' + MODEL.look_ahead);
  x.push(MODEL.look_ahead);
}

function VMI_push_round(x) {
  // Push the current round number (a=1, z=26, etc.).
  const r = VM.round_letters.indexOf(VM.round_sequence[VM.current_round]);
  if(DEBUGGING) console.log('push round number R = ' + r);
  x.push(r);
}

function VMI_push_last_round(x) {
  // Push the last round number (a=1, z=26, etc.).
  const r = VM.round_letters.indexOf(VM.round_sequence[MODEL.rounds - 1]);
  if(DEBUGGING) console.log('push last round number LR = ' + r);
  x.push(r);
}

function VMI_push_number_of_rounds(x) {
  // Push the number of rounds (= length of round sequence).
  if(DEBUGGING) console.log('push number of rounds NR = ' + MODEL.rounds);
  x.push(MODEL.rounds);
}

function VMI_push_run_number(x) {
  // Push the number of the current run in the selected experiment (or 0).
  const
      sx = EXPERIMENT_MANAGER.selected_experiment,
      nox = (sx ? ` (in ${sx.title})` : ' (no experiment)'),
      xr = (sx ? sx.active_combination_index : 0);
  if(DEBUGGING) console.log('push current run number XR = ' + xr + nox);
  x.push(xr);
}

function VMI_push_number_of_runs(x) {
  // Push the number of runs in the current experiment (0 if no experiment).
  const
      sx = EXPERIMENT_MANAGER.selected_experiment,
      nox = (sx ? `(in ${sx.title})` : '(no experiment)'),
      nx = (sx ? sx.combinations.length : 0);
  if(DEBUGGING) console.log('push number of rounds NR =', nx, nox);
  x.push(nx);
}

function VMI_push_random(x) {
  // Push a random number from the interval [0, 1).
  const r = Math.random();
  if(DEBUGGING) console.log('push random =', r);
  x.push(r);
}

function VMI_push_pi(x) {
  // Push the goniometric constant pi.
  if(DEBUGGING) console.log('push pi');
  x.push(Math.PI);
}

function VMI_push_true(x) {
  // Push the Boolean constant TRUE.
  if(DEBUGGING) console.log('push TRUE');
  x.push(1);
}

function VMI_push_false(x) {
  // Push the Boolean constant FALSE.
  if(DEBUGGING) console.log('push FALSE');
  x.push(0);
}

function VMI_push_infinity(x) {
  // Push the constant representing infinity for the solver.
  if(DEBUGGING) console.log('push +INF');
  x.push(VM.PLUS_INFINITY);
}

function VMI_push_epsilon(x) {
  // Push the constant representing epsilon (smallest positive number that is
  // still considered as non-zero) for the solver.
  if(DEBUGGING) console.log('push +EPSILON');
  x.push(VM.ON_OFF_THRESHOLD);
}

function valueOfIndexVariable(v) {
  // AUXILIARY FUNCTION for the VMI_push_(i, j or k) instructions.
  // Return the value of the iterator index variable for the current
  // experiment.
  if(MODEL.running_experiment) {
    const lead = v + '=';
    for(const sel of MODEL.running_experiment.activeCombination) {
      if(sel.startsWith(lead)) return parseInt(sel.substring(2));
    }
  }
  return 0;
}

function VMI_push_i(x) {
  // Push the value of iterator index i.
  const i = valueOfIndexVariable('i');
  if(DEBUGGING) console.log('push i = ' + i);
  x.push(i);
}

function VMI_push_j(x) {
  // Push the value of iterator index j.
  const j = valueOfIndexVariable('j');
  if(DEBUGGING) console.log('push j = ' + j);
  x.push(j);
}

function VMI_push_k(x) {
  // Push the value of iterator index k.
  const k = valueOfIndexVariable('k');
  if(DEBUGGING) console.log('push k = ' + k);
  x.push(k);
}

function pushTimeStepsPerTimeUnit(x, unit) {
  // AUXILIARY FUNCTION for the VMI_push_(time unit) instructions.
  // Push the number of model time steps represented by 1 unit.
  // NOTE: This will typically be a real number -- no rounding.
  const t = VM.time_unit_values[unit] / MODEL.time_scale /
      VM.time_unit_values[MODEL.time_unit]; 
  if(DEBUGGING) console.log(`push ${unit} = ${VM.sig4Dig(t)}`);
  x.push(t);
}

function VMI_push_year(x) {
  // Push the number of time steps in one year.
  pushTimeStepsPerTimeUnit(x, 'year');
}

function VMI_push_week(x) {
  // Push the number of time steps in one week.
  pushTimeStepsPerTimeUnit(x, 'week');
}

function VMI_push_day(x) {
  // Push the number of time steps in one day.
  pushTimeStepsPerTimeUnit(x, 'day');
}

function VMI_push_hour(x) {
  // Push the number of time steps in one hour.
  pushTimeStepsPerTimeUnit(x, 'hour');
}

function VMI_push_minute(x) {
  // Push the number of time steps in one minute.
  pushTimeStepsPerTimeUnit(x, 'minute');
}

function VMI_push_second(x) {
  // Push the number of time steps in one second.
  pushTimeStepsPerTimeUnit(x, 'second');
}

function VMI_push_contextual_number(x) {
  // Push the numeric value of the context-sensitive number #.
  const n = valueOfNumberSign(x);
  if(DEBUGGING) {
    console.log('push contextual number: # = ' + VM.sig2Dig(n));
  }
  x.push(n);
}

/* VM instruction helper functions */

function valueOfNumberSign(x) {
  // Push the numeric value of the # sign for the context of expression `x`.
  // NOTE: This can be a wildcard match, an active experiment run selector
  // ending on digits, or the number context of an entity. The latter
  // typically is the number its name or any of its prefixes ends on, but
  // notes are more "creative" and can return the number context of nearby
  // entities.
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
    // inferred from a number in the name of the object).
    if(s.indexOf('*') < 0 && s.indexOf('?') < 0) {
      const d = x.object.numberContext;
      if(d) {
        s = x.object.displayName;
        m = d;
        n = parseInt(d);
      }
    }
  }
  // For datasets, set the parent anchor to be the context-sensitive number.
  if(x.object instanceof Dataset) x.object.parent_anchor = n;
  if(DEBUGGING) {
    console.log(`context for # in expression for ${x.variableName}
- expression: ${x.text}
- inferred value of # ${s} => ${m} => ${n}`, x.code);
  }
  return n;
}

function relativeTimeStep(t, anchor, offset, dtm, x) {
  // Return the relative time step, given t, anchor, offset,
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
      // NOTE: For not array-type datasets, ^ is equivalent to #.
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
  if(anchor === 'f') {
    // Last: offset relative to index  1 in the vector.
    return 1 + offset;
  }
  if(anchor === 'l') {
    // Last: offset relative to the last index in the vector.
    return VM.nr_of_time_steps + offset;
  }
  const cb = Math.trunc((t - 1) / MODEL.block_length);
  if(anchor === 'c') {
    // Relative to start of current optimization block.
    return cb * MODEL.block_length + 1 + offset;
  }
  if(anchor === 'p') {
    // Relative to start of previous optimization block.
    return (cb - 1) * MODEL.block_length + 1 + offset;
  }
  if(anchor === 'n') {
    // Relative to start of next optimization block.
    return (cb + 1) * MODEL.block_length + 1 + offset;
  }
  if(anchor === 's') {
    // Scaled: offset is scaled to time unit of run.
    return Math.floor(offset * dtm);
  }
  // Fall-through: offset relative to the initial value index (0).
  return offset;
}

function twoOffsetTimeStep(t, a1, o1, a2, o2, dtm, x) {
  // Return the list [rt, ao1, ao2] where `rt` is the time step, and
  // `ao1` and `ao2` are anchor-offset shorthand for the debugging message,
  // given `t`, the two anchors plus offsets, and the delta-t-multiplier.
  // NOTES:
  // (1) `dtm` will differ from 1 only for experiment results.
  // (2) Expression `x` is passed to provide context for evaluation of #.
  let t1 = relativeTimeStep(t, a1, o1, dtm, x),
      ao1 = [' @ ', a1, (o1 > 0 ? '+' : ''), (o1 ? o1 : ''),
          ' = ', t1].join(''),
      ao2 = '';
  if(o2 !== o1 || a2 !== a1) {
    // Two different offsets => use the midpoint as time (NO aggregation!).
    const t2 = relativeTimeStep(t, a2, o2, dtm, x);
    ao2 = [' : ', a2, (o2 > 0 ? '+' : ''), (o2 ? o2 : ''), ' = ', t2].join('');
    t1 = Math.floor((t1 + t2) / 2);
    ao2 += ' => midpoint = ' + t1;
  }
  return [t1, ao1, ao2];
}

/* VM instructions (continued) */

function VMI_push_var(x, args) {
  // Push the value of the variable specified by `args`, being the list
  // [obj, anchor1, offset1, anchor2, offset2] where `obj` can be a vector
  // or an expression, or a cluster unit balance specifier.
  const
      obj = args[0],
      // NOTE: Use the "local" time step for expression `x`.
      tot = twoOffsetTimeStep(x.step[x.step.length - 1],
          args[1], args[2], args[3], args[4], 1, x);
  let t = tot[0];
  // Negative time step is evaluated as t = 0 (initial value), while t
  // beyond the optimization period is evaluated as its last time step
  // UNLESS t is used in a self-referencing variable.
  const xv = obj.hasOwnProperty('xv');
  if(!xv) {
    t = Math.max(0, Math.min(
        MODEL.end_period - MODEL.start_period + MODEL.look_ahead + 1, t));
  }
  // Trace only now that time step t has been computed.
  if(DEBUGGING) {
    console.log('push var:', (xv ? '[SELF]' :
        (obj instanceof Expression ? obj.text : '[' + obj.toString() + ']')),
        tot[1] + ' ' + tot[2]);
  }
  if(Array.isArray(obj)) {
    // Object is a vector.
    let v = t < obj.length ? obj[t] : VM.UNDEFINED;
    // NOTE: When the vector is the "active" parameter for sensitivity
    // analysis, the value is multiplied by 1 + delta %.
    if(obj === MODEL.active_sensitivity_parameter) {
      // NOTE: Do NOT scale exceptional values.
      if(v > VM.MINUS_INFINITY && v < VM.PLUS_INFINITY) {
        v *= (1 + MODEL.sensitivity_delta * 0.01);
      }
    }
    x.push(v);
  } else if(xv) {
    // Variable references an earlier value computed for this expression `x`.
    x.push(t >= 0 && t < x.vector.length ? x.vector[t] : obj.dv);
  } else if(obj.hasOwnProperty('c') && obj.hasOwnProperty('u')) {
    // Object holds link lists for cluster balance computation.
    x.push(MODEL.flowBalance(obj, t));
  } else if(obj instanceof Expression) {
    x.push(obj.result(t));
  } else if(typeof obj === 'number') {
    // Object is a number.
    x.push(obj);
  } else {
    console.log('ERROR: VMI_push_var object =', obj);
    x.push(VM.UNKNOWN_ERROR);
  }
}

function VMI_push_entity(x, args) {
  // Push a special "entity reference" object based on `args`, being the
  // list [obj, anchor1, offset1, anchor2, offset2] where `obj` has the
  // format {r: entity object, a: attribute}.
  // The object that is pushed on the stack passes the entity, the
  // attribute to use, and the time interval.
  const
      // NOTE: Use the "local" time step for expression `x`.
      tot = twoOffsetTimeStep(x.step[x.step.length - 1],
          args[1], args[2], args[3], args[4], 1, x),
      er = {entity: args[0].r, attribute: args[0].a, t1: tot[0], t2: tot[1]};
  // Trace only now that time step t has been computed.
  if(DEBUGGING) {
    console.log(['push entity: ', er.entity.displayName, '|', er.attribute,
        ', t = ', er.t1, ' - ', er.t2].join(''));
  }
  x.push(er);
}

function VMI_push_method(x, args) {
  // Push the result of the expression associated with the method (a
  // dataset modifier with a selector that starts with a colon).
  // The first element of the argument list specifies the method,
  // and possibly also the entity to be used as its object.
  // NOTE: Methods can only be called "as is" (without prefix) in a
  // method expression. The object of such "as is" method calls is
  // the object of the calling method expression `x`, or for chart
  // variables the method object selected for the chart.
  const
      method = args[0].meq,
      mex = method.expression,
      // NOTE: If method object prefix is not specified in the first
      // argument, use the MOP of the calling method (if specified).
      mo_prefix = args[0].mo || x.method_object_prefix,
      // NOTE: Use the "local" time step for expression `x`.
      tot = twoOffsetTimeStep(x.step[x.step.length - 1],
          args[1], args[2], args[3], args[4], 1, x);
  if(!x.method_object && !mo_prefix) {
    console.log('ERROR: Undefined method object', x);
    x.push(VM.BAD_REF);
    return;
  }
  if(x.method_object) {
    // Set the method object to be used in VMI_push_wildcard_entity.
    mex.method_object = x.method_object;
  } else if(mex.isEligible(mo_prefix)) {
    mex.method_object_prefix = mo_prefix;
  } else {
    console.log('ERROR: ', mo_prefix, 'is not in eligible list of',
        method.selector, method.eligible_prefixes);
    x.push(VM.BAD_REF);
    return;
  }
  const
      t = tot[0],
      v = mex.result(t);
  // Trace only now that time step t has been computed.
  if(DEBUGGING) {
    console.log('push method:',
        (mex.method_object ? mex.method_object.displayName : 'PREFIX=' + mex.method_object_prefix),
        method.selector, tot[1] + (tot[2] ? ':' + tot[2] : ''), 'value =', VM.sig4Dig(v));
  }
  x.push(v);
  // Clear the method object & prefix -- just to be neat.
  mex.method_object = null;
  mex.method_object_prefix = '';
}

function VMI_push_wildcard_entity(x, args) {
  // Push the value of (or reference to) an entity attribute, based on
  // `args`, being the list [obj, anchor1, offset1, anchor2, offset2]
  // where `obj` has the format {ee: list of eligible entities,
  // n: name (with wildcard #), a: attribute, br: by reference (boolean)}
  let obj = null,
      nn = args[0].n;
  const el = args[0].ee;
  // NOTE: Variables in method expressions that reference the object of
  // the method also code with this VM instruction, but then pass the
  // string "MO" instead of the list of eligible entities. This indicates
  // that the `method_object` property of expression `x` should be used.
  if(el === 'MO') {
    obj = x.method_object;
    if(!obj && x.method_object_prefix) {
      // Try to identity the object by the prefixed name.
      obj = MODEL.objectByName(x.method_object_prefix +
          UI.PREFIXER + nn.substring(1));
    }
    if(!obj) {
      console.log(`ERROR: Undefined method object`, x);
      x.push(VM.BAD_REF);
      return;
    }
  } else {
    // Select the first entity in `ee` that matches the wildcard vector
    // index of the expression `x` being executed.
    if(x.wildcard_vector_index === false && x.isWildcardExpression &&
        MODEL.running_experiment) {
      // If no wildcard vector index, try to infer it.
      x.wildcard_vector_index = matchingNumberInList(
          MODEL.running_experiment.activeCombination, x.attribute);
    }
    nn = nn.replace('#', x.wildcard_vector_index);
    for(const e of el) {
      if(e.name === nn) obj = e;
      break;
    }
    // If no match, then this indicates a bad reference.
    if(!obj) {
      console.log(`ERROR: no match for "${nn}" in eligible entity list`, el, x);
      x.push(VM.BAD_REF);
      return;
    }
  }
  // Now `obj` should be an existing model entity.
  // If args[0] indicates "by reference", then VMI_push_entity can be
  // called with the appropriate parameters.
  const attr = args[0].a || obj.defaultAttribute;
  if(args[0].br) {
    VMI_push_entity(x, [{r: obj, a: attr},
        args[1], args[2], args[3], args[4]]);
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
  } else if(mx && wcnr === false) {
    // Regular dataset with explicit modifier.
    obj = mx;
  } else if(!ud) {
    // If no selector and not "use data", check whether a running experiment
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
  // NOTE: The first argument specifies the experiment run results:
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
      // NOTE: When *expression* `x` for which this instruction is executed
      // is a dataset modifier, use the time scale of the dataset, not of the
      // model, because the dataset vector is scaled to the model time scale.
      model_dt = MODEL.timeStepDuration;
  // For tracing purposes, keep the experiment result specifics when inferred.
  let trc = '';
  // NOTE: Run result can now default to UNDEFINED, because the VM now handles
  // exceptional values better: no call stack dump on "undefined" etc., but
  // only on real errors.
  let v = rrspec.dv || VM.UNDEFINED;
  if(rrspec && rrspec.hasOwnProperty('x')) {
    let xp = rrspec.x,
        rn = rrspec.r,
        rri = rrspec.v;
    if(xp === false) {
      // If no experiment is specified, use the running experiment.
      // NOTE: To facilitate testing a "single run" without using the
      // Experiment manager, default to the experiment that is selected
      // in the Experiment manager (but not "running").
      xp = MODEL.running_experiment || EXPERIMENT_MANAGER.selected_experiment;
    }
    if(xp instanceof Experiment) {
      if(Array.isArray(rn)) {
        // Let the running experiment infer run number from selector list `rn`
        // and its own "active combination" of selectors.
        rn = xp.matchingCombinationIndex(rn);
      } else if(rn < 0) {
        // Relative run number: use current run # + r (first run has number 0).
        if(xp === MODEL.running_experiment) {
          rn += xp.active_combination_index;
        } else if(xp.chart_combinations.length) {
          // Modeler has selected one or more runs in the viewer table.
          // Find the highest number of a selected run that has been performed.
          let last = -1;
          for(const ccn of xp.chart_combinations) {
            if(ccn > last && ccn < xp.runs.length) last = ccn;
          }
          // If no performed runs are selected, use the last performed run. 
          if(last < 0) last = xp.runs.length - 1;
          rn += last;
        } else {
          // Choose the run relative to the total number of completed runs.
          rn += xp.runs.length - 1;
        }
      } else if(rrspec.nr !== false) {
        // Run number inferred from local time step of expression.
        const
            rl = VM.nr_of_time_steps,
            range = rangeToList(rrspec.nr, xp.runs.length - 1);
        if(range) {
          const
              l = range.length,
              ri = Math.floor(x.step[x.step.length - 1] * l / rl);
          rn = (ri < l ? range[ri] : range[l - 1]);
        }
      }
      // If variable is passed as identifier, get its index for the experiment.
      if(typeof rri === 'string') rri = xp.resultIndex(rri);
      // Then proceed only if run number and result index both make sense.
      const run_count = (xp.completed ? xp.runs.length :
          xp.active_combination_index);
      if(rn !== false && rn >= 0 && rn < run_count) {
        const r = xp.runs[rn];
        if(rri in r.results) {
          const
              rr = r.results[rri],
              tsd = r.time_step_duration,
              // Get the delta-t multiplier: divide model time step duration
              // by time step duration of the experiment run if they differ.
              dtm = (Math.abs(tsd - model_dt) < VM.NEAR_ZERO ? 1 : model_dt / tsd);
          let stat = rrspec.s;
          // For outcome datasets without specific statistic, default to LAST.
          if(!(stat || rr.x_variable)) stat = 'LAST';
          // For a valid experiment variable, the default value is 0.
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
            trc = [xp.title, ', run #', rn,
                ', variable ', rr.displayName,
                ', ', stat, ' = ', v.toPrecision(4)].join('');
            if(DEBUGGING) {
              console.log('push run result: ' + trc);
            }
          } else {
            // No statistic => return the vector for local time step,
            // using here, too, the delta-time-modifier to adjust the offsets
            // for different time steps per experiment.
            const tot = twoOffsetTimeStep(x.step[x.step.length - 1],
                args[1], args[2], args[3], args[4], dtm, x);
            // Scale the (midpoint) time step (at current model run time scale)
            // to the experiment run time scale and get the run result value.
            // NOTE: The .m property specifies the time scaling method, and
            // the .p property whether the run result vector should be used as
            // a periodic time series.
            v = rr.valueAtModelTime(tot[0], model_dt, rrspec.m, rrspec.p);
            trc = [xp.title,
                ', run #', rn,
                ', variable ', rr.displayName, tot[1], tot[2],
                ', value = ', v.toPrecision(4)].join('');
            if(DEBUGGING) {
              console.log('push run result: ' + trc);
            }
          }
        }
      }
    }
  }
  // Truncate near-zero values by 2x the on/off threshold...
  if(v && Math.abs(v) < VM.ON_OFF_THRESHOLD) {
    if(trc) {
      trc = 'for ' + trc;
    } else {
      trc = v + ' to zero';
    }
    console.log('NOTE: Truncated experiment run result ' + trc);
    // Always truncate.
    v = 0;
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
  // If no list specified, the result is undefined.
  if(!Array.isArray(list) || list.length === 0) {
    x.push(VM.UNDEFINED);
    return;          
  }
  // Get the "local" time step range for expression `x`.
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
  // optimization period is evaluated as its last time step.
  const tmax = VM.nr_of_time_steps;
  t1 = Math.max(0, Math.min(tmax, t1));
  t2 = Math.max(0, Math.min(tmax, t2));
  // Trace only now that time step range has been computed
  if(DEBUGGING) {
    const trc = ['push statistic: [', stat, ': N = ', list.length, ']',
        ao1, ao2, ' (t = ', t1, '-', t2, ')'];
    console.log(trc.join(''));
  }
  // Establish whether statistic pertains to non-zero values only.
  const nz = stat.endsWith('NZ');
  // If so, trim the 'NZ'.
  if(nz) stat = stat.slice(0, -2);
  // Now t1 ... t2 is the range of time steps to iterate over for each variable.
  const vlist = [];
  for(let t = t1; t <= t2; t++) {
    // Get the list of values.
    // NOTE: Variables may be vectors or expressions.
    for(const obj of list) {
      v = VM.UNDEFINED;
      if(Array.isArray(obj)) {
        // Object is a vector.
        if(t < obj.length) v = obj[t];
      } else if(obj instanceof Expression) {
        // Object is an expression.
        v = obj.result(t);
      } else if(!isNaN(obj)) {
        v = obj;
      }
      // Push value unless it is zero and NZ is TRUE, or if it is undefined
      // (this will occur when a variable has been deleted).
      if(v <= VM.PLUS_INFINITY && (!nz || Math.abs(v) > VM.NEAR_ZERO)) {
        vlist.push(v);
      }
    }
  }
  const
      n = vlist.length,
      // NOTE: count is the number of values used in the statistic.
      count = (nz ? n : list.length * (t2 - t1 + 1));
  if(stat === 'N') {
    x.push(count);
    return;
  }
  // If no non-zero values remain, all statistics are zero (as ALL values were zero).
  if(n === 0) {
    x.push(0);
    return;          
  }
  // Check which statistic, starting with the most likely to be used.
  if(stat === 'MIN') {
    x.push(Math.min(...vlist));
    return;
  }
  if(stat === 'MAX') {
    x.push(Math.max(...vlist));
    return;
  }
  // For all remaining statistics, the sum must be calculated.
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

function VMI_replace_undefined(x) {
  // Replace one of the two top numbers on the stack by the other if the
  // one is undefined.
  // NOTE: pop(TRUE) denotes that "undefined" should be ignored as issue.
  const d = x.pop(true);
  if(d !== false) {
    if(DEBUGGING) console.log('REPLACE UNDEFINED (' + d.join(', ') + ')');
    x.retop(d[0] === VM.UNDEFINED ? d[1] : d[0]);
  }
}

// NOTE: When the VM computes logical OR, AND and NOT, any non-zero number
// is interpreted as TRUE.

function VMI_or(x) {
  // Perform a logical OR on the two top numbers on the stack.
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('OR (' + d.join(', ') + ')');
    x.retop(d[0] !== 0 || d[1] !== 0 ? 1 : 0);
  }
}

function VMI_and(x) {
  // Perform a logical AND on the two top numbers on the stack.
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('AND (' + d.join(', ') + ')');
    x.retop(d[0] === 0 || d[1] === 0 ? 0 : 1);
  }
}

function VMI_not(x) {
  // Perform a logical NOT on the top number of the stack.
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('NOT ' + d);
    x.retop(d === 0 ? 1 : 0);
  }
}

function VMI_abs(x) {
  // Replace the top number of the stack by its absolute value.
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('ABS ' + d);
    x.retop(Math.abs(d));
  }
}

function VMI_eq(x) {
  // Test equality of the two top numbers on the stack.
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('EQ (' + d.join(', ') + ')');
    x.retop(d[0] === d[1] ? 1 : 0);
  }
}

function VMI_ne(x) {
  // Test inequality of the two top numbers on the stack.
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('NE (' + d.join(', ') + ')');
    x.retop(d[0] !== d[1] ? 1 : 0);
  }
}

function VMI_lt(x) {
  // Test whether second number on the stack is less than the top number.
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('LT (' + d.join(', ') + ')');
    x.retop(d[0] < d[1] ? 1 : 0);
  }
}

function VMI_gt(x) {
  // Test whether second number on the stack is greater than the top number.
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('GT (' + d.join(', ') + ')');
    x.retop(d[0] > d[1] ? 1 : 0);
  }
}

function VMI_le(x) {
  // Test whether second number on the stack is less than, or equal to,
  // the top number.
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('LE (' + d.join(', ') + ')');
    x.retop(d[0] <= d[1] ? 1 : 0);
  }
}

function VMI_ge(x) {
  // Test whether second number on the stack is greater than, or equal to,
  // the top number.
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('LE (' + d.join(', ') + ')');
    x.retop(d[0] >= d[1] ? 1 : 0);
  }
}

function VMI_at(x) {
  // Pop the top number on the stack, and use its integer part as index i
  // to replace the new top element (which must be a dataset or a grouping)
  // by its i-th element.
  let d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('AT (' + d.join(', ') + ')');
    let a,
        from = false,
        to = false,
        step = 1,
        group = false,
        period = false,
        range = [],
        ok = true;
    // Check whether the first argument (d[0]) is indexable.
    if(d[0] instanceof Array) {
      a = d[0];
      group = true;
    } else if(d[0].entity instanceof Dataset) {
      a = d[0].entity.vector;
      period = d[0].periodic;
    } else {
      x.retop(VM.ARRAY_INDEX);
      return;
    }
    // Check whether the second argument (d[1]) is a number or a pair.
    if(d[1] instanceof Array) {
      if(d[1].length > 3 || typeof d[1][0] !== 'number') {
        ok = false;
      } else if(d[1].length === 3) {
        // Optional third index argument is range index increment.
        if(typeof d[1][2] === 'number') {
          step = Math.floor(d[1][2]);
          // Ignore increment if it truncates to zero.
          if(!step) step = 1;
          // Get the range end.
          if(typeof d[1][1] === 'number') {
            to = Math.floor(d[1][1]);
          } else {
            ok = false;
          }
        } else {
          ok = false;
        }
      } else if(d[1].length === 2) {
        // Optional second argument is range index end.
        if(typeof d[1][1] === 'number') {
          to = Math.floor(d[1][1]);
        } else {
          ok = false;
        }
      }
      if(ok) {
        from = Math.floor(d[1][0]);
        // Groupings are 0-based arrays but indexed as 1-based.
        if(group) {
          from--;
          to--;
        }
        // Check whether from, to and step are feasible.
        if(to !== false) {
          if(to <= from && step < 0) {
            for(let i = from; i >= to; i += step) range.push(i);
          } else if(to >= from && step > 0) {
            for(let i = from; i <= to; i += step) range.push(i);
          } else {
            ok = false;
          }
        }
      }
    }
    if(ok && !range.length && typeof d[1] === 'number') {
      range = [Math.floor(d[1]) - (group ? 1 : 0)];
    } else if(!range.length) {
      ok = false;
    }
    if(!ok) {
      x.retop(VM.ARRAY_INDEX);
      return;
    }
    const
        n = range.length,
        r = [];
    for(let i = 0; i < n; i++) {
      const index = range[i];
      if(index < 0) {
        r.push(VM.UNDEFINED);
      } else if(period) {
        r.push(a[index % a.length]);
      } else {
        r.push(a[index]);
      }
    }
    if(n === 1) {
      x.retop(r[0]);
    } else {
      x.retop(r);
    }
  }
}

function VMI_add(x) {
  // Pop the top number on the stack, and add it to the new top number.
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('ADD (' + d.join(', ') + ')');
    if(Math.abs(d[0]) === VM.PLUS_INFINITY) {
      x.retop(d[0]);
    } else if(Math.abs(d[1]) === VM.PLUS_INFINITY) {
      x.retop(d[1]);
    } else {
      x.retop(d[0] + d[1]);
    }
  }
}

function VMI_sub(x) {
  // Pop the top number on the stack, and subtract it from the new
  // top number.
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('SUB (' + d.join(', ') + ')');
    if(d[0] === VM.PLUS_INFINITY || d[1] === VM.MINUS_INFINITY) {
      x.retop(VM.PLUS_INFINITY);
    } else if(d[0] === VM.MINUS_INFINITY || d[1] === VM.PLUS_INFINITY) {
      x.retop(VM.MINUS_INFINITY);
    } else {
      x.retop(d[0] - d[1]);
    }
  }
}

function VMI_mul(x) {
  // Pop the top number on the stack, and multiply it with the new
  // top number.
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('MUL (' + d.join(', ') + ')');
    if(Math.abs(d[0]) === VM.PLUS_INFINITY || Math.abs(d[1]) === VM.PLUS_INFINITY) {
      x.retop(VM.PLUS_INFINITY * Math.sign(d[0] * d[1]));
    } else {
      x.retop(d[0] * d[1]);
    }
  }
}

function VMI_div(x) {
  // Pop the top number on the stack, and divide the new top number
  // by it. In case of division by zero, replace the top by #DIV/0!
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('DIV (' + d.join(', ') + ')');
    if(Math.abs(d[1]) <= VM.NEAR_ZERO) {
      x.retop(VM.DIV_ZERO);
    } else if(Math.abs(d[0]) === VM.PLUS_INFINITY) {
      if(Math.abs(d[1]) === VM.PLUS_INFINITY) {
        // Treat INF / INF as 1.
        x.retop(Math.sign(d[0]) * Math.sign(d[1]));
      } else {
        // Push the + or - infinity value.
        x.retop(d[0]);
      }
    } else if(Math.abs(d[1]) === VM.PLUS_INFINITY) {
      // Treat N / Infinity as 0 for any non-infinite value of N.
      x.retop(0);
    } else {
      // Standard division.
      x.retop(d[0] / d[1]);
    }
  }
}

function VMI_div_zero(x) {
  // Implements the "robust" division operator A // B.
  // Pop the top number B from the stack. If B = 0, retain the new
  // top number A; otherwise replace the top by A/B.
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('DIV-ZERO (' + d.join(', ') + ')');
    if(Math.abs(d[1]) <= VM.NEAR_ZERO) {
      x.retop(d[0]);
    } else if(Math.abs(d[0]) === VM.PLUS_INFINITY) {
      if(Math.abs(d[1]) === VM.PLUS_INFINITY) {
        // Treat INF / INF as 1.
        x.retop(Math.sign(d[0]) * Math.sign(d[1]));
      } else {
        // Push the + or - infinity value.
        x.retop(d[0]);
      }
    } else if(Math.abs(d[1]) === VM.PLUS_INFINITY) {
      // Treat N / Infinity as 0 for any non-infinite value of N.
      x.retop(0);
    } else {
      // Standard division.
      x.retop(d[0] / d[1]);
    }
  }
}

function VMI_mod(x) {
  // Perform a "floating point MOD operation" as explained below.
  // Pop the top number on the stack. If zero, push error code #DIV/0!.
  // Otherwise, proceed: divide the new top number by the divisor, take
  // the fraction part, and multiply this with the divisor.
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('DIV (' + d.join(', ') + ')');
    if(Math.abs(d[1]) <= VM.NEAR_ZERO) {
      x.retop(VM.DIV_ZERO);
    } else if(Math.abs(d[0]) === VM.PLUS_INFINITY || Math.abs(d[1]) === VM.PLUS_INFINITY) {
      // If either operand is infinite, return 0 as remainder.
      x.retop(0);
    } else {
      x.retop(d[0] % d[1]);  // % is the modulo operator in JavaScript.
    }
  }
}

function VMI_negate(x) {
  // Perform a negation on the top number of the stack.
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('NEG ' + d);
    x.retop(-d);
  }
}

function VMI_power(x) {
  // Pop the top number on the stack, and raise the new top number
  // to its power.
  const d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('POWER (' + d.join(', ') + ')');
    const r = Math.pow(d[0], d[1]);
    if(isNaN(r)) {
      x.retop(VM.BAD_CALC);
    } else if(r >= VM.PLUS_INFINITY) {
      x.retop(VM.PLUS_INFINITY);
    } else if(r <= VM.MINUS_INFINITY) {
      x.retop(VM.MINUS_INFINITY);
    } else {
      x.retop(r);
    }
  }
}

function VMI_sqrt(x) {
  // Replace the top number of the stack by its square root, or by
  // error code #VALUE! if the top number is negative.
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('SQRT ' + d);
    if(d < 0) {
      x.retop(VM.BAD_CALC);
    } else if (d === VM.PLUS_INFINITY) {
      x.retop(VM.PLUS_INFINITY);
    } else {
      x.retop(Math.sqrt(d));
    }
  }
}

function VMI_sin(x) {
  // Replace the top number X of the stack by sin(X).
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('SIN ' + d);
    const r = Math.sin(d);
    if(isNaN(r) || Math.abs(d) === VM.PLUS_INFINITY) {
      x.retop(VM.BAD_CALC);
    } else {
      x.retop(r);
    }
  }
}

function VMI_cos(x) {
  // Replace the top number X of the stack by cos(X).
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('COS ' + d);
    const r = Math.cos(d);
    if(isNaN(r) || Math.abs(d) === VM.PLUS_INFINITY) {
      x.retop(VM.BAD_CALC);
    } else {
      x.retop(r);
    }
  }
}

function VMI_atan(x) {
  // Replace the top number X of the stack by atan(X).
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('ATAN ' + d);
    const r = Math.atan(d);
    if(isNaN(r) || Math.abs(d) === VM.PLUS_INFINITY) {
      x.retop(VM.BAD_CALC);
    } else {
      x.retop(r);
    }
  }
}

function VMI_ln(x) {
  // Replace the top number X of the stack by ln(X), or by error
  // code #VALUE! if X is negative.
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('LN ' + d);
    if(d < 0) {
      x.retop(VM.BAD_CALC);
    } else if(d === VM.PLUS_INFINITY) {
      x.retop(VM.PLUS_INFINITY);
    } else {
      x.retop(Math.log(d));
    }
  }
}

function VMI_exp(x) {
  // Replace the top number X of the stack by exp(X).
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('EXP ' + d);
    if(d === VM.PLUS_INFINITY) {
      x.retop(VM.PLUS_INFINITY);
    } else if(d === VM.MINUS_INFINITY) {
      x.retop(0);
    } else {
      x.retop(Math.exp(d));
    }
  }
}

function VMI_log(x) {
  // Pop the top number B from the stack, and replace the new top
  // number A by A log B. NOTE: x = A log B  <=>  x = ln(B) / ln(A)
  let d = x.pop();
  if(d !== false) {
    if(DEBUGGING) console.log('LOG (' + d.join(', ') + ')');
    if(Math.abs(d[0]) === VM.PLUS_INFINITY || Math.abs(d[1]) === VM.PLUS_INFINITY) {
      x.retop(VM.BAD_CALC);
    } else {
      try {
        d = Math.log(d[1]) / Math.log(d[0]);
      } catch(err) {
        d = VM.BAD_CALC;
      }
      x.retop(d);
    }
  }
}

function VMI_round(x) {
  // Replace the top number X of the stack by round(X).
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('ROUND ' + d);
    x.retop(Math.round(d));
  }
}

function VMI_int(x) {
  // Replace the top number X of the stack by its integer part.
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('INT ' + d);
    x.retop(Math.trunc(d));
  }
}

function VMI_fract(x) {
  // Replace the top number X of the stack by its fraction part.
  const d = x.top();
  if(d !== false) {
    if(DEBUGGING) console.log('FRACT ' + d);
    x.retop(d - Math.trunc(d));
  }
}

function VMI_exponential(x) {
  // Replace the top number X of the stack by a random number from the
  // negative exponential distribution with parameter X (so X is the lambda,
  // and the mean will be 1/X).
  const d = x.top();
  if(d !== false) {
    const a = randomExponential(d);
    if(DEBUGGING) console.log(`EXPONENTIAL ${d} = ${a}`);
    x.retop(a);
  }
}

function VMI_poisson(x) {
  // Replace the top number X of the stack by a random number from the
  // poisson distribution with parameter X (so X is the mean value lambda).
  const d = x.top();
  if(d !== false) {
    const a = randomPoisson(d);
    if(DEBUGGING) console.log('POISSON ' + d + ' = ' + a);
    x.retop(a);
  }
}

function VMI_binomial(x) {
  // Replace the top list (!) A of the stack by Bin(A[0], A[1]), i.e.,
  // a random number from the binomial distribution with n = A[0] and
  // p = A[1].
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

function VMI_normal(x) {
  // Replace the top list (!) A of the stack by N(A[0], A[1]), i.e.,
  // a random number from the normal distribution with mu = A[0] and
  // sigma = A[1].
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

function VMI_weibull(x) {
  // Replace the top list (!) A of the stack by Weibull(A[0], A[1]), i.e.,
  // a random number from the Weibull distribution with lambda = A[0]
  // and k = A[1].
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

function VMI_triangular(x) {
  // Replaces the top list (!) A of the stack by Tri(A[0], A[1]), A[2]),
  // i.e., a random number from the triangular distribution with a = A[0],
  // b = A[1], and c = A[2]. NOTE: if only 2 parameters are passed, c is
  // assumed to equal (a + b) / 2.
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

function VMI_mpp(x) {
  // Replace the top list (!) A of the stack by the minimum periodic payment
  // (mpp) of the 3 arguments in A. A[0] is the interest rate r, A[1] is the
  // number of time periods n, and A[2] is the required present value PV.
  // The minimum periodic payment MPP can then be inferred using the standard
  // equation PV = MPP * (1 - (1+r)^-n) / r.
  const d = x.top();
  if(d !== false) {
    if(d instanceof Array && d.length === 3) {
      // Algebra gives MPP = PV * r / (1 - (1+r)^-n).
      const mpp = d[2] * d[0] / (1 - Math.pow(1 + d[0], -d[1]));
      if(DEBUGGING) console.log('MPP (' + d.join(', ') + ') = ' + mpp);
      x.retop(mpp);
    } else {
      if(DEBUGGING) console.log('MPP: invalid parameter(s) ' + d);
      x.retop(VM.PARAMS);
    }
  }
}

function VMI_npv(x) {
  // Replace the top list (!) A of the stack by the net present value (NPV)
  // of the arguments in A. A[0] is the interest rate r, A[1] is the number
  // of time periods n. If A has only 1 or 2 elements, the NPV is 0.
  // If A has 3 elements, A[2] is the constant cash flow C, and the NPV is
  // the sum (for t = 0 to n-1) of C/(1+r)^t. If A has N>2 elements, A[2]
  // through A[N] are considered as a cash flow time series C0, C1, ..., CN-2
  // that is then discounted.
  // NOTE: If A is not a list, A considered to be the single argument, and
  // is hence replaced by 0.
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

function VMI_min(x) {
  // Replace the top list (!) A of the stack by the lowest value in this
  // list. If A is not a list, A is left on the stack.
  const d = x.top();
  if(d !== false && d instanceof Array) {
    if(DEBUGGING) console.log('MIN (' + d.join(', ') + ')');
    x.retop(Math.min(...d));
  } else if(DEBUGGING) {
    console.log('MIN (' + d + ')');
  }
}

function VMI_max(x) {
  // Replace the top list (!) A of the stack by the highest value in this
  // list. If A is not a list, A is left on the stack.
  const d = x.top();
  if(d !== false && d instanceof Array) {
    if(DEBUGGING) console.log('MAX (' + d.join(', ') + ')');
    x.retop(Math.max(...d));
  } else if(DEBUGGING) {
    console.log('MAX (' + d + ')');
  }
}

function VMI_concat(x) {
  // Pop the top number B from the stack, and then replace the new top
  // element A by [A, B] if A is a number, or add B to A if A is a list
  // of numbers (!), or concatenate if A and B both are lists.
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
  // Set the program counter of the VM to `index` minus 1, as the
  // counter is ALWAYS increased by 1 after calling a VMI function.
  if(DEBUGGING) console.log('JUMP ' + index);
  x.program_counter = index - 1;
}

function VMI_jump_if_false(x, index) {
  // Test the top number A on the stack, and if A is FALSE (zero or
  // VM.UNDEFINED) set the program counter of the VM to `index` minus 1,
  // as the counter is ALWAYS increased by 1 after calling a VMI function.
  const r = x.top(true);
  if(DEBUGGING) console.log(`JUMP-IF-FALSE (${r}, ${index})`);
  if(r === 0 || r === VM.UNDEFINED || r === false) {
    // Only jump on FALSE, leaving the stack "as is", so that in case
    // of no THEN, the expression result equals the IF condition value.
    // NOTE: Also do this on a stack error (r === false).
    x.program_counter = index - 1;
  } else {
    // Remove the value from the stack.
    x.stack.pop();
  }
}

function VMI_pop_false(x) {
  // Remove the top value from the stack, which should be 0 or
  // VM.UNDEFINED (but this is not checked).
  const r = x.stack.pop();
  if(DEBUGGING) console.log(`POP-FALSE (${r})`);
}

function VMI_if_then(x) {
  // NO operation -- as of version 1.0.14, this function only serves as
  // placeholder in operator symbol arrays. The parser should no longer
  // code this, so its execution would indicate an error.
  console.log('WARNING: IF-THEN instruction is obsolete', x);
}

function VMI_if_else(x) {
  // NO operation -- as of version 1.0.14, this function only serves as
  // placeholder in operator symbol arrays. The parser should no longer
  // code this, so its execution would indicate an error.
  console.log('WARNING: IF-ELSE instruction is obsolete', x);
}

//
// Functions that implement random numbers from specific distribution.
//

function randomExponential(lambda) {
  // Return a random number drawn from a Exp(lambda) distribution.
  return -Math.log(Math.random()) / lambda;
}

function randomWeibull(lambda, k) {
  // Return a random number drawn from a Weibull(lambda, k) distribution.
  if(Math.abs(k) < VM.NEAR_ZERO) return VM.DIV_ZERO;
  return lambda * Math.pow(-Math.log(Math.random()), 1.0 / k);
}

function randomTriangular(a, b, c=0.5*(a + b)) {
  // Return a random number drawn from a Triangular(a, b, c) distribution.
  const u = Math.random(), b_a = b - a, c_a = c - a;
  if(u < c_a / b_a) {
    return a + Math.sqrt(u * b_a * c_a);
  } else {
    return b - Math.sqrt((1 - u) * b_a * (b - c)); 
  }
}

function randomNormal(mean, std) {
  // Return a random number drawn from a N(mean, standard deviation)
  // distribution.
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

// Function that computes the cumulative probability P(X <= x) when X
// has a N(mu, sigma) distribution. Accuracy is about 1e-6.
function normalCumulativeProbability(mu, sigma, x) {
	const
      t = 1 / (1 + 0.2316419 * Math.abs(x)),
	    d = 0.3989423 * Math.exp(-0.5 * x * x),
	    p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 +
          t * (-1.821256 + T * 1.330274))));
	if(x > 0) return 1 - p;
	return p;
}   

// Global array as cache for computation of factorial numbers.
const FACTORIALS = [0, 1];

function factorial(n) {
  // Fast factorial function using pre-calculated values up to n = 100.
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
    // Use Knuth's algorithm.
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do {
      k++;
      p *= Math.random();
    } while(p > L);
    return k - 1;
  } else {
    // Use "method PA" from Atkinson, A.C. (1979). The Computer Generation
    // of Poisson Random Variables, Journal of the Royal Statistical Society
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
Keep in mind that var_index starts at 1 to comply with LP_solve convention.

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
      p = VM.variables[vi - 1][1],
      k = VM.offset + vi,
      r = VM.round_letters.indexOf(VM.round_sequence[VM.current_round]),
      // When diagnosing an unbounded problem, use low value for INFINITY,
      // but the optional fourth parameter indicates whether the solver's
      // infinity values should override the diagnosis INFINITY.
      // NOTE: For grid processes, the bounds are always "capped" so as
      // to permit Big M constraints for the associated binary variables.
      inf_is_free = (args.length > 3 && args[3]),
      inf_val = (p.grid ? VM.UNLIMITED_POWER_FLOW :
          (VM.diagnose && !inf_is_free ?
              VM.DIAGNOSIS_UPPER_BOUND : VM.SOLVER_PLUS_INFINITY));
  let l,
      u,
      fixed = (vi in VM.fixed_var_indices[r - 1]);
  if(fixed) {
    // Set both bounds equal to the level set in the previous round,
    // or to 0 if this is the first round.
    if(VM.current_round) {
      l = p.actualLevel(VM.t);
      // QUICK PATCH! Should resolve that small non-zero process levels
      // computed in prior round make problem infeasible.
      if(l < VM.ON_OFF_THRESHOLD) l = 0;
    } else {
      l = 0;
    }
    u = l;
    fixed = ' (FIXED ' + p.displayName + ')';
  } else {
    // Set bounds as specified by the two arguments.
    l = args[1];
    u = args[2];
    if(u instanceof Expression) u = u.result(VM.t);
    u = Math.min(u, inf_val);
    // When LB is passed as NULL, this indicates: LB = -UB.
    if(l === null) {
      l = -u;
    } else { 
      if(l instanceof Expression) l = l.result(VM.t);
      if(l === VM.UNDEFINED) {
        l = 0;
      } else {
        l = Math.max(l, -inf_val);
      }
    }
    fixed = '';
  }
  // NOTE: To see in the console whether fixing across rounds works, insert
  // "fixed !== '' || " before DEBUGGING below.
  if(isNaN(l) || isNaN(u) ||
      typeof l !== 'number' || typeof u !== 'number' || DEBUGGING) {
    console.log(['set_bounds [', k, '] ', p.displayName, '[',
      VM.variables[vi - 1][0],'] t = ', VM.t, ' LB = ', VM.sig4Dig(l),
      ', UB = ', VM.sig4Dig(u), fixed].join(''), l, u, inf_val, 'args:', args);
    console.log(p);
    throw "STOP";
  } else if(u < l) {
    // Check the difference, as this may be negligible.
    if(u - l < VM.SIG_DIF_FROM_ZERO) {
      u = Math.round(u * 1e5) / 1e5;
      // NOTE: This may result in -0 (minus zero) => then set to 0.
      if(u < 0 && u > -VM.NEAR_ZERO) u = 0;
    } else {
      // If substantial, warn that "impossible" bounds would have been set.
      const vk = p.displayName;
      if(!VM.bound_issues[vk]) VM.bound_issues[vk] = [];
      VM.bound_issues[vk].push(VM.t);
    }
    // Set LB to UB, so that lowest value is bounding.
    l = u;
  }
  // NOTE: Since the VM vectors for lower bounds and upper bounds are
  // initialized with default values (0 for LB, +INF for UB), the bounds
  // need only be set when they differ from these default values.
  if(l !== 0) VM.lower_bounds[k] = l;
  if(u < VM.SOLVER_PLUS_INFINITY) {
    VM.upper_bounds[k] = u;
    // NOTE: Extra bounds should be set only when this VMI is executed
    // for the node level variable.
    if(p.level_var_index === vi) {
      // (1) If associated node must be NZP-partitioned, set bounds of its
      // partitioning variables.
      if(p.is_zero_var_index >= 0) {
        // Set bounds on the NZP-partitioning variables.
        VM.upper_bounds[VM.offset + p.nep_var_index] = VM.ON_OFF_THRESHOLD;
        VM.upper_bounds[VM.offset + p.pep_var_index] = VM.ON_OFF_THRESHOLD;
        // NOTE: The semi-continuous partitions must have upper bound >= 0...
        VM.upper_bounds[VM.offset + p.nsc_var_index] = Math.max(-l, 0);
        VM.upper_bounds[VM.offset + p.psc_var_index] = Math.max(u, 0);
        // ... and lower bound "epsilon" *unless* semi-continuous variables
        // are not supported by the solver.
        if(!VM.noSemiContinuous) {
          VM.lower_bounds[VM.offset + p.nsc_var_index] = VM.ON_OFF_THRESHOLD;
          VM.lower_bounds[VM.offset + p.psc_var_index] = VM.ON_OFF_THRESHOLD;
        }
      }
      // (2) If associated node is FROM-node of a "peak increase" link, then
      // the "peak increase" variables of this node must have the highest
      // UB of the node (for all t in this block, hence MAX) MINUS their
      // peak level in previous block.
      if(p.peak_inc_var_index >= 0) {
        u = Math.max(0, u - p.b_peak[VM.block_count - 1]);
        const
            cvi = VM.chunk_offset + p.peak_inc_var_index,
            // Check if peak UB already set for previous t
            piub = VM.upper_bounds[cvi];
        // If so, use the highest value
        if(piub) u = Math.max(piub, u);
        VM.upper_bounds[cvi] = u;
        VM.upper_bounds[cvi + 1] = u;
      }
      // (3) For grid elements, bounds must be set on UP and DOWN variables.
      if(p.grid) {
        // When considering losses, partition range 0...UB in sections.
        const step = (MODEL.ignore_power_losses || p.grid.loss_approximation < 2 ?
            u : u / p.grid.loss_approximation);
        VM.upper_bounds[VM.offset + p.up_1_var_index] = step;
        VM.upper_bounds[VM.offset + p.down_1_var_index] = step;
        if(p.grid.loss_approximation > 1) {
          // Set UB for semi-continuous variables Up & Down slope 2.
          VM.upper_bounds[VM.offset + p.up_2_var_index] = 2 * step;
          VM.upper_bounds[VM.offset + p.down_2_var_index] = 2 * step;
          if(p.grid.loss_approximation > 2) {
            // Set UB for semi-continuous variables Up & Down slope 3.
            VM.upper_bounds[VM.offset + p.up_3_var_index] = 3 * step;
            VM.upper_bounds[VM.offset + p.down_3_var_index] = 3 * step;
          }
        }
        // NOTE: lower bounds are 0 for all variables; their semi-continuous
        // ranges are set by VMI_add_grid_process_constraints.
      }
    }
  }
}

function VMI_clear_coefficients() {
  // Clear the coefficients register and set RHS to zero.
  if(DEBUGGING) console.log('clear_coefficients');
  VM.coefficients = {};
  VM.rhs = 0;
}

// AUXILIARY FUNCTION (added to support debugging)
function knownValue(vi, t) {
  // Return the value of decision variable X that has already been
  // computed while optimizing a previous block. 
  // `vi` is the variable index for X, so use vi-1 for the zero-based
  // list VM.variables list.
  const vbl = VM.variables[vi - 1];
  if(vbl === undefined) throw 'Bad variable index: ' + vi;
  // NOTE: priorValue deals with special cases for binary variables.
  const pv = VM.priorValue(vbl, t);
  if(DEBUGGING) {
    console.log(`--known value: ${vbl[0]} ${vbl[1].displayName} @ ${t} = ${pv}`);
  }
  return pv;
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
  const k = VM.offset + vi - d*VM.cols;
  if(DEBUGGING) {
    console.log(`add_const_to_coefficient [${k}]: ${VM.sig4Dig(n)}`);
  }
  // A negative delay may result in a variable index beyond the tableau
  // column range. Such "future variables" should always be ignored.
  if(k > VM.chunk_offset) return;
  if(k <= 0) {
    // NOTE: If `k` falls PRIOR to the start of the block being solved,
    // this means that the value of the decision variable X for which the
    // coefficient C is to be set by this instruction has been calculated
    // while solving a previous block. Since the value of X is known,
    // adding n to C is implemented as subtracting n*X from the right hand
    // side of the constraint.
    VM.rhs -= knownValue(vi, VM.t - d) * n;
  } else if(k in VM.coefficients) {
    VM.coefficients[k] += n;
  } else {
    VM.coefficients[k] = n;
  }
}

function VMI_add_const_to_sum_coefficients(args) {
  // NOTE: Used to implement data links with SUM multiplier.
  // `args`: [var_index, number, delay (, 1)]
  const vi = args[0];
  let d = args[2].object.actualDelay(VM.t),
      k = VM.offset + vi - d * VM.cols,
      t = VM.t - d,
      n = args[1];
  if(args.length > 3) n /= (d + 1);
  if(DEBUGGING) {
    console.log('add_const_to_sum_coefficients [' + k + ']: ' +
      VM.sig4Dig(n) + '; delay = ' + d);
  }
  // NOTE: When delay is negative, start at time t, not t - d.
  if(d < 0) {
    k = VM.offset + vi;
    t = VM.t;
    d = -d;
  }
  for(let i = 0; i <= d; i++) {
    // Variables beyond the chunk length should be ignored.
    if(k > VM.chunk_offset) return;
    if(k <= 0) {
      // See NOTE in VMI_add_const_to_coefficient instruction.
      VM.rhs -= knownValue(vi, t) * n;
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
    // 4th argument = 1 indicates "delay + 1".
    if(args.length > 3 && args[3]) d++;
  }
  const
      k = VM.offset + vi - d*VM.cols,
      t = VM.t - d;
  let r = args[1].result(t);
  // Optional 5th parameter is a constant multiplier.
  if(args.length > 4) r *= args[4];
  if(DEBUGGING) {
    console.log('add_var_to_coefficient [' + k + ']: ' +
        args[1].variableName + ' (t = ' + t + ')');
  }
  // Ignore "future variables".
  if(k > VM.chunk_offset) return;
  if(k <= 0) {
    // See NOTE in VMI_add_const_to_coefficient instruction.
    VM.rhs -= knownValue(vi, t) * r;
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
      v = args[1];
  let d = args[2].object.actualDelay(VM.t),
      k = VM.offset + vi - d * VM.cols,
      t = VM.t - d;
  if(DEBUGGING) {
    console.log('add_var_to_weighted_sum_coefficients [' + k + ']: ' +
        VM.sig4Dig(w) + ' * ' + v.variableName + ' (t = ' + t + ')');
  }
  // NOTE: When delay is negative, start at time t, not t - d.
  if(d < 0) {
    k = VM.offset + vi;
    t = VM.t;
    d = -d;
  }
  for(let i = 0; i <= d; i++) {
    // Ignore "future variables".
    if(k > VM.chunk_offset) return;
    let r = v.result(t);
    if(args.length > 3) r /= (d + 1);
    if(k <= 0) {
      // See NOTE in VMI_add_const_to_coefficient instruction
      VM.rhs -= knownValue(vi, t) * r;
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
  const k = VM.offset + vi - d*VM.cols;
  if(DEBUGGING) {
    console.log('subtract_const_from_coefficient [' + k + ']: ' + VM.sig4Dig(n));
  }
  // Ignore "future variables".
  if(k > VM.chunk_offset) return;
  if(k <= 0) {
    // See NOTE in VMI_add_const_to_coefficient instruction
    VM.rhs += knownValue(vi, VM.t - d) * n;
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
  // Ignore "future variables".
  if(k > VM.chunk_offset) return;
  if(k <= 0) {
    // See NOTE in VMI_add_const_to_coefficient instruction.
    VM.rhs += knownValue(vi, t) * r;
  } else if(k in VM.coefficients) {
    VM.coefficients[k] -= r;
  } else {
    VM.coefficients[k] = -r;
  }
}

/* AUXILIARY FUNCTIONS for setting cash flow coefficients */

function addCashIn(index, value) {
  // NOTE: Negative coefficients will make that variable CI gets
  // a higher value, so subtract `value`, rather than add it!
  if(index in VM.cash_in_coefficients) {
    // Add value to coefficient if it already exists...
    VM.cash_in_coefficients[index] -= value;
  } else {
    // ... and set it if it is new.
    VM.cash_in_coefficients[index] = -value;
  }
}

function addCashOut(index, value) {
  // NOTE: Negative coefficients will make that variable CO gets
  // a higher value, so subtract `value`, rather than add it!
  if(index in VM.cash_out_coefficients) {
    // Add value to coefficient if it already exists...
    VM.cash_out_coefficients[index] -= value;
  } else {
    // ... and set it if it is new.
    VM.cash_out_coefficients[index] = -value;
  }
}

function VMI_update_cash_coefficient(link) {
  // Updates cash flow coefficients that are affected by the specified link.
  // Simplest case: INPUT links. These must have a process as tail node.
  const t = VM.t;
  if(DEBUGGING) {
    console.log(`update_cash_coefficient: ${link.displayName} (t = ${t})`,
        link);
  }
  const
      tn = link.to_node,
      fn = link.from_node;
  if(tn instanceof Process) {
    // Input links have no delay or special link multipliers.
    const
        price = fn.price.result(t),
        rate = link.relative_rate.result(t),
        price_rate = price * rate,
        abs_pr = Math.abs(price_rate),
        reversible = tn.lower_bound.result(t) < 0;
    if(!reversible) {
      // When process has non-negative lower bound, this simplifies things.
      if(!abs_pr) return;
      const k = VM.offset + tn.level_var_index;
      if(rate > 0) {
        // Process consumes.
        if(price > 0) {
          addCashOut(k, abs_pr);
        } else {
          addCashIn(k, abs_pr);
        }
      } else if(price_rate < 0) {
        // Process produces.
        if(price > 0) {
          addCashIn(k, abs_pr);
        } else {
          addCashOut(k, abs_pr);
        }
      }
      return;
    }
    // When process is reversible, it should have NZP-partitioning.
    if(tn.is_zero_var_index < 0) {
      VM.logMessage(VM.block_count, VM.WARNING + 'Process ' + tn.displayName +
          ' has cash flow but no partitioned level');
      return;
    }
    // Input links have no delay or special link multipliers.
    if(abs_pr) {
      const
          nk = VM.offset + tn.nsc_var_index,
          pk = VM.offset + tn.psc_var_index;
      if(price_rate > 0) {
        // Consumption is cash OUT; negative level = production => cash IN.
        addCashOut(pk, abs_pr);
        addCashIn(nk, abs_pr);
      } else {
        // Consumption is cash IN; negative level = production => cash OUT.
        addCashIn(pk, abs_pr);
        addCashOut(nk, abs_pr);
      }
    }
    return;
  }

  // Link is output of a process, so it may have a delay.
  const
      lm = link.multiplier,
      delay = link.actualDelay(t),
      // NOTE: For cash flows, use t without delay, as this is when the
      // actual product flow occurs...
      price = tn.price.result(t),
      rate = link.relative_rate.result(t),
      price_rate = price * rate,
      abs_pr = Math.abs(price_rate),
      // ... but check the lower process bound at t-delay!
      reversible = tn.lower_bound.result(t - delay) < 0;

  // NOTE: Even for (statistics over) delayed flows, the rate and price
  // at time t is used, so when rate*price = 0, no cash flow occurs.
  if(!abs_pr) return;

  // NOTE: When reversible, process *must* have a NZP level partition.
  if(reversible && fn.is_zero_var_index < 0) {
    VM.logMessage(VM.block_count, VM.WARNING + 'Process ' + fn.displayName +
        ' has cash flow but no partitioned level');
    return;
  }

  // Get the indices for the NZP-partitioning of the production level
  // variable.
  const
      vi = fn.level_var_index,
      posvi = fn.plus_var_index,
      negvi = fn.minus_var_index,
      // NOTE: When not reversible, use the level index as "positive".
      pscvi = (reversible ? fn.psc_var_index : vi),
      nscvi = (reversible ? fn.nsc_var_index : vi),
      pepvi = fn.pep_var_index,
      nepvi = fn.nep_var_index;

  // SUM and MEAN may require iteration over multiple time steps.
  if(delay && lm === VM.LM_SUM || lm === VM.LM_MEAN) {
    // For MEAN, coefficients must be divided by the number of time steps.
    const
        nts = Math.abs(delay) + 1,
        m = (lm === VM.LM_MEAN ? 1 / nts : 1);
    let dt = Math.min(delay, 0),
        nk = VM.offset + nscvi - dt * VM.cols,
        pk = VM.offset + pscvi - dt * VM.cols;
    for(let i = 0; i < nts; i++) {
      // Variables beyond the tableau column range (when delay < 0) can
      // be ignored, so then exit this loop.
      if(pk > VM.chunk_offset) break;
      if(pk <= 0) {
        // NOTE: If `pk` falls PRIOR to the start of the block being solved,
        // calculate the (average) cash flow for the known (!) process level.
        const cf = fn.actualLevel(t - dt) * price_rate * m;
        if(cf > 0) {
          // Subtract CF from the RHS of the cash IN constraint, as then
          // the actor's CI variable must be higher.
          VM.cash_in_rhs -=  cf;
        } else if(cf < 0) {
          // Add the negative CF to the RHS of the cash OUT constraint, as
          // then the actor's CO variable must be higher.
          VM.cash_out_rhs += cf;      
        }
      } else {
        // NOTE: Adjust `abs_pr` when averaging.
        const abs_pr = Math.abs(price_rate) * m;
        // Update coefficient of the process level in the correct constraint.
        if(price_rate > 0) {
          // Production is cash IN.
          addCashIn(pk, abs_pr);
          // Negative level (if possible) = consumption => cash OUT
          if(reversible) addCashOut(nk, abs_pr);
        } else {
          // Production is cash OUT..
          addCashOut(pk, abs_pr);
          // Negative level (if possible) = consumption => cash IN
          if(reversible) addCashIn(nk, abs_pr);
        }
      }
      dt++;
      nk += VM.cols;
      pk += VM.cols;
    }
    return;
  }

  // For most cases, the coefficient index will be the level.
  let k = VM.offset + vi - delay * VM.cols;
  // NOTE: When delay < 0, `k` may fall beyond the tableau column range.
  // If so, any such "future" cash flow can be ignored.
  if(k > VM.chunk_offset) return;

  // NOTE: Without delay, SUM and MEAN are equivalent to LEVEL.
  // The process level may be positive as well as negative, hence the need
  // to differentiate between the positive and negative level variable.
  if(lm === VM.LM_LEVEL || lm === VM.LM_SUM || lm === VM.LM_MEAN) {
    const
        pk = (reversible ? k - vi + pscvi : k),
        nk = (reversible ? k - vi + nscvi : k);
    // For output links, level > 0 is production, level < 0 is consumption.
    const abs_pr = Math.abs(price_rate);
    if(price_rate > 0) {
      // Production is cash IN; negative level = consumption => cash OUT.
      addCashIn(pk, abs_pr);
      if(reversible) addCashOut(nk, abs_pr);
    } else {
      // Now production is cash OUT; negative level generates cash IN.
      addCashOut(pk, abs_pr);
      if(reversible) addCashIn(nk, abs_pr);
    }
    return;    
  }
  
  if(lm === VM.LM_INCREASE) {
    // NOTE: Here, the actual flow is X[t-delta] - X[t-delta-1], so the delay
    // shifts the time step, but the difference is always between t and t-1.
    const
        k_1 = k - VM.cols,
        dt = t - delay;
    if(k < 0) {
      // Both values have been computed for the prior block.
      // Then if t-delay < 1, no change can have occurred, because then
      // both X[t-delay] and X[t-delay-1] have the process' initial level. 
      if(dt < 1) return;
      // Otherwise, get the CF based on the known increase.
      const cf = (fn.actualLevel(dt) - fn.actualLevel(dt - 1)) * price_rate;
      if(cf > 0) {
        VM.cash_in_rhs -= cf;
      } else if(cf < 0) {
        VM.cash_out_rhs += cf;      
      }
    // NOTE: The increase may be positive as well as negative, and that
    // may cause negative values for cash IN and cash OUT. This can only
    // be resolved by introducting additional (binary) variables.
    // As it is unlikely that priced "delta" links will be used, cash
    // flow computation constraints will not differentiate between
    // cash IN and cash OUT, but allocate the signed (!) difference to
    // cash IN when price*rate > 0 and to cash OUT when price*rate < 0.
    } else if(k_1 < 0) {
      // Only X[t-1] has been computed for the prior block.
      const cf_1 = fn.actualLevel(dt - 1) * price_rate;
      if(price_rate > 0) {
        VM.cash_in_rhs -= cf_1;
        addCashIn(k, price_rate);
      } else if(price_rate < 0) {
        VM.cash_out_rhs += cf_1;      
        addCashOut(k, -price_rate);
      }
    } else {
      // Update coefficients of both indices.
      if(price_rate > 0) {
        addCashIn(k, price_rate);
        addCashIn(k_1, -price_rate);
      } else if(price_rate < 0) {
        addCashOut(k, -price_rate);
        addCashOut(k_1, price_rate);
      }
    }
    return;
  }
  
  // Spinning reserve and maximum ramp-up/ramp-down relate to bounds.
  if(lm === VM.LM_SPINNING_RESERVE ||
      lm === VM.LM_MAX_INCREASE || lm === VM.LM_MAX_DECREASE) {
    const
        ub = fn.upper_bound.result(t),
        lb = fn.lower_bound.result(t);
    // No ramping up or down when LB > UB (should not occur) or LB = UB. 
    if(lb >= ub || Math.abs(ub - lb) < VM.NEAR_ZERO) return;
    if(k <= 0) {
      // NOTE: If tableau column index `k` falls PRIOR to the start of the block
      // being solved, the actual flow (max. increase, max. decrease or spinning
      // reserve) follows from the known production level and the relevant bound.
      let af = 0;
      const
          pl = fn.actualLevel(t - delay),
          maxinc = ub - pl,
          maxdec = pl - lb;
      if(lm === VM.LM_MAX_INCREASE) {
        af = maxinc;
      } else if(lm === VM.LM_MAX_DECREASE) {
        af = maxdec;
      } else if(pl > VM.ON_OFF_THRESHOLD) {
        af = maxinc;
      } else if(pl < -VM.ON_OFF_THRESHOLD) {
        af = maxdec;
      }
      // The cash flow equals actual flow * rate * price...
      cf = af * price_rate;
      // ... and can be included in the cash IN if > 0, or cash OUT if < 0.
      if(cf > VM.NEAR_ZERO) {
        VM.cash_in_rhs -= cf;
      } else if(cf < -VM.NEAR_ZERO) {
        VM.cash_out_rhs += cf;
      }
    } else if(lm === VM.LM_SPINNING_RESERVE) {
      // The spinning reserve follows from the NPZ-partitioned level:
      // SR = (POS*UB - PEP - PSC) + (NEG*-LB - NEP - NSC)
      // where the first term is relevant only when UB > 0, and the second
      // term only when LB < 0.
      const kdi = k - vi;
      if(price_rate > 0) {
        // SR generates cash IN.
        if(ub > 0) {
          addCashIn(kdi + posvi, ub * price_rate);
          addCashIn(kdi + pepvi, -price_rate);
          addCashIn(kdi + pscvi, -price_rate);
        }
        if(lb < 0) {
          addCashIn(kdi + negvi, -lb * price_rate);
          addCashIn(kdi + nepvi, -price_rate);
          addCashIn(kdi + nscvi, -price_rate);
        }
      } else {
        // SR generates cash OUT.
        if(ub > 0) {
          addCashOut(kdi + posvi, ub * price_rate);
          addCashOut(kdi + pepvi, -price_rate);
          addCashOut(kdi + pscvi, -price_rate);
        }
        if(lb < 0) {
          addCashOut(kdi + negvi, -lb * price_rate);
          addCashOut(kdi + nepvi, -price_rate);
          addCashOut(kdi + nscvi, -price_rate);
        }
      }
    } else if(lm === VM.LM_MAX_INCREASE) {
      // The maximum increase equals UB - level.
      if(price_rate > 0) {
        // MaxInc generates cash IN.
        VM.cash_in_rhs -= ub * price_rate;
        addCashIn(vi, -price_rate);
      } else {
        // MaxInc generates cash OUT.
        VM.cash_out_rhs += ub * price_rate;
        addCashout(vi, price_rate);
      }
    } else {
      // The maximum decrease equals -LB + level.
      if(price_rate > 0) {
        // MaxInc generates cash IN.
        VM.cash_in_rhs += lb * price_rate;
        addCashIn(vi, price_rate);
      } else {
        // MaxInc generates cash OUT.
        VM.cash_out_rhs -= lb * price_rate;
        addCashout(vi, -price_rate);
      }
    }
    return;
  }

  let bvi = vi;
  if(lm === VM.LM_PEAK_INC) {
    // NOTE: Peak increase can generate cash only at the first time
    // step of a block (when VM.offset = 0) and at the first time step
    // of the look-ahead period (when VM.offset = block length).
    if(VM.offset > 0 && VM.offset !== MODEL.block_length) return;
    k = VM.chunk_offset + fn.peak_inc_var_index;
    // Use look-ahead peak increase when offset > 0.
    if(VM.offset) k++;
  } else {
    // By default, `vi` is the process level index, and `k` the coefficient
    // index (column number for this variable in the tableau).
    // For "binary data links", adjust `k` so it corresponds with the correct
    // binary variable instead of the level.
    if(lm === VM.LM_STARTUP) {
      bvi = fn.start_up_var_index;
    } else if(lm === VM.LM_SHUTDOWN) {
      bvi = fn.shut_down_var_index;
    } else if(lm === VM.LM_POSITIVE) {
      bvi = fn.plus_var_index;
    } else if(lm === VM.LM_ZERO) {
      bvi = fn.is_zero_var_index;
    } else if(lm === VM.LM_NEGATIVE) {
      bvi = fn.minus_var_index;
    } else if(lm === VM.LM_CYCLE) {
      bvi = fn.cycle_var_index;
    } else if(lm === VM.LM_FIRST_COMMIT) {
      bvi = fn.first_commit_var_index;
    }
    k += bvi - vi;
  }
  if(k <= 0) {
    // If `k` falls PRIOR to the start of the block being solved,
    // use the known prior value of the decision variable to compute
    // the cash flow.
    const cf = knownValue(bvi, t - delay) * price_rate;
    if(cf > 0) {
      VM.cash_in_rhs -= cf;
    } else if(cf < 0) {
      VM.cash_out_rhs += cf;      
    }
  } else if(price_rate > 0) {
    addCashIn(k, price_rate);
  } else if(price_rate < 0) {
    addCashOut(k, -price_rate);
  }
}

function VMI_update_grid_process_cash_coefficients(p) {
  // Update cash flow coefficients for process `p` that relate to its
  // regular input and output link (data links are handled by means of
  // VMI_update_cash_coefficient).
  let fn = null,
      tn = null;
  for(const l of p.inputs) {
    if(l.multiplier === VM.LM_LEVEL &&
        !MODEL.ignored_entities[l.identifier]) {
      fn = l.from_node;
      break;
    }
  }
  for(const l of p.outputs) {
    if(l.multiplier === VM.LM_LEVEL &&
        !MODEL.ignored_entities[l.identifier]) {
      tn = l.to_node;
      break;
    }
  }
  const
      fp = (fn && fn.price.defined ? fn.price.result(VM.t) : 0),
      tp = (tn && tn.price.defined ? tn.price.result(VM.t) : 0);
  // Only proceed if process links to a product with a non-zero price.
  if(fp || tp) {
    const
        gpv = VM.gridProcessVarIndices(p, VM.offset),
        lr = p.lossRates(VM.t);
    if(fp > 0) {    
      // If FROM node has price > 0, then all UP flows generate cash OUT
      // *without* loss while all DOWN flows generate cash IN *with* loss.
      for(let i = 0; i < gpv.slopes; i++) {
        addCashOut(gpv.up[i], -fp);
        addCashIn(gpv.down[i], (1 - lr[i]) * -fp);
      }
    } else if(fp < 0) {
      // If FROM node has price < 0, then all UP flows generate cash IN
      // *without* loss while all DOWN flows generate cash OUT *with* loss.
      for(let i = 0; i < gpv.slopes; i++) {
        addCashIn(gpv.up[i], fp);
        addCashOut(gpv.down[i], (1 - lr[i]) * fp);
      }
    }
    if(tp > 0) {    
      // If TO node has price > 0, then all UP flows generate cash IN *with*
      // loss while all DOWN flows generate cash OUT *without* loss.
      for(let i = 0; i < gpv.slopes; i++) {
        addCashIn(gpv.up[i], (1 - lr[i]) * -tp);
        addCashOut(gpv.down[i], -tp);
      }
    } else if(tp < 0) {
      // If TO node has price < 0, then all UP flows generate cash OUT
      // *with* loss while all DOWN flows generate cash IN *without* loss.
      for(let i = 0; i < gpv.slopes; i++) {
        addCashOut(gpv.up[i], (1 - lr[i]) * tp);
        addCashIn(gpv.down[i], tp);
      }
    }
  }
}

function VMI_set_objective() {
  // Copies the coefficients to the vector for the objective function
  if(DEBUGGING) console.log('set_objective');
  for(let i in VM.coefficients) if(Number(i)) {
    VM.objective[i] = VM.coefficients[i];
  }
  // NOTE: For peak increase to function properly, the peak variables
  // must have a small penalty (about 0.1 currency unit) in the objective
  // function.
  if(VM.chunk_variables.length > 0) {
    for(let i = 0; i < VM.chunk_variables.length; i++) {
      const vn = VM.chunk_variables[i][0]; 
      if(vn.indexOf('peak') > 0) {
        const pvp = VM.PEAK_VAR_PENALTY / VM.cash_scalar;
        // NOTE: Chunk offset takes into account that indices are 0-based.
        VM.objective[VM.chunk_offset + i] = -pvp;
        // Put higher penalty on "block peak" than on "look-ahead peak"
        // to ensure that block peak will always be the smaller value
        // of the two peaks.
        if(vn.startsWith('b')) VM.objective[VM.chunk_offset + i] -= pvp;
      }
    }
  }
}

function VMI_set_const_rhs(c) {
  if(DEBUGGING) console.log('set_const_rhs: ' + VM.sig4Dig(c));
  VM.rhs = c;
}

function VMI_set_var_rhs(x) {
  VM.rhs = x.result(VM.t);
  if(DEBUGGING) {
    console.log(`set_var_rhs: ${x.variableName} (t = ${VM.t}) = ` +
        VM.sig4Dig(VM.rhs));
  }
}

function VMI_add_constraint(ct) {
  // Appends the current coefficients as a row to the matrix, the current
  // RHS to the RHS vector, and `ct` to the constraint type vector.
  if(DEBUGGING) console.log('add_constraint: ' + VM.constraint_codes[ct]);
  const row = {};
  for(let i in VM.coefficients) if(Number(i)) {
    // Do not add (near)zero coefficients to the matrix.
    const c = VM.coefficients[i];
    if(Math.abs(c) >= VM.NEAR_ZERO) {
      row[i] = c;
    }
  }
  // Special case: 
  if(ct === VM.ACTOR_CASH) {
    VM.actor_cash_constraints.push(VM.matrix.length);
    ct = VM.EQ;
  }
  let rhs = VM.rhs;
  // Check for <= (near) +infinity and >= (near) -infinity: such
  // constraints should not be added to the model.
  if((ct === VM.LE && rhs >= 0.1 * VM.PLUS_INFINITY) ||
      (ct === VM.GE && rhs < 0.1 * VM.MINUS_INFINITY)) {
    if(DEBUGGING) console.log('Ignored infinite bound constraint');
  } else {
    VM.matrix.push(row);
    if(rhs >= VM.PLUS_INFINITY) {
      rhs = (VM.diagnose ? VM.DIAGNOSIS_UPPER_BOUND :
          VM.SOLVER_PLUS_INFINITY);
    } else if(rhs <= VM.MINUS_INFINITY) {
      rhs = (VM.diagnose ? -VM.DIAGNOSIS_UPPER_BOUND :
          VM.SOLVER_MINUS_INFINITY);
    }
    VM.right_hand_side.push(rhs);
    VM.constraint_types.push(ct);
  }
}

function VMI_add_semicontinuous_constraints(p) {
  // Add constraints that make the level variable and (if `p` needs NZP-partition
  // also the POSL and NEGL variables) behave as semi-continuous variables.
  const
      l_index = p.level_var_index + VM.offset,
      lb_index = p.semic_var_index + VM.offset,
      posl_index = p.psc_var_index + VM.offset,
      negl_index = p.nsc_var_index + VM.offset,
      poslb_index = p.pscb_var_index + VM.offset,
      neglb_index = p.nscb_var_index + VM.offset,
      lbx = p.lower_bound,
      ubx = (p.equal_bounds && lbx.defined ? lbx : p.upper_bound),
      lb = lbx.result(VM.t),
      ub = ubx.result(VM.t);
  let row;
  // Make level semi-continuous (processes only).
  if(lb_index >= 0) {
    if(lb > 0 && lb <= ub) {
      // LB*binary - level <= 0
      row = {};
      row[lb_index] = lb;
      row[l_index] = -1;
      VM.matrix.push(row);
      VM.right_hand_side.push(0);
      VM.constraint_types.push(VM.LE);
      // level - UB*binary <= 0
      row = {};
      row[l_index] = 1;
      row[lb_index] = -ub;
      VM.matrix.push(row);
      VM.right_hand_side.push(0);
      VM.constraint_types.push(VM.LE);
    } else {
      console.log('ANOMALY: Failed to set semi-continuous bounds for',
          p.displayName, 'for t =', VM.t, 'LB =', lb, 'UB =', ub);
    }
  }
  // Make NZP-partitioning variables semi-continuous.
  // NOTE: These variables have lower bound "epsilon", and the same upper
  // bound as the level of `p`. If UB <= 0, no constraint should be added.
  if(poslb_index >= 0 && ub > 0) {
    // epsilon*binary - POSL <= 0
    row = {};
    row[poslb_index] = VM.ON_OFF_THRESHOLD;
    row[posl_index] = -1;
    VM.matrix.push(row);
    VM.right_hand_side.push(0);
    VM.constraint_types.push(VM.LE);
    // POSL - UB*binary <= 0
    row = {};
    row[posl_index] = 1;
    row[poslb_index] = -ub;
    VM.matrix.push(row);
    VM.right_hand_side.push(0);
    VM.constraint_types.push(VM.LE);
  }
  // NOTE: For NEGL, the LB of `p` should be negative, and then the
  // -LB should become the UB of NEGL.
  if(neglb_index >= 0 && lb < 0) {
    // epsilon*binary - NEGL <= 0
    row = {};
    row[neglb_index] = VM.ON_OFF_THRESHOLD;
    row[negl_index] = -1;
    VM.matrix.push(row);
    VM.right_hand_side.push(0);
    VM.constraint_types.push(VM.LE);
    // NEGL + LB*binary <= 0, because LB < 0 -- see above.
    row = {};
    row[negl_index] = 1;
    row[neglb_index] = lb;
    VM.matrix.push(row);
    VM.right_hand_side.push(0);
    VM.constraint_types.push(VM.LE);
  }
}

function VMI_add_NZP_binary_constraints(p) {
  // Add constraints that set correct values for binary variables
  // associated with process or product `p`.
  if(DEBUGGING) {
    console.log('add_NZP_binary_constraints (t = ' + VM.t + ')');
  }
  if(!p || p.is_zero_var_index < 0) throw 'ANOMALY: No binary variable indices';
  const block = VM.block_count;
  let lb = p.lower_bound.result(VM.t),
      ub = (p.equal_bounds ? lb : p.upper_bound.result(VM.t)),
      hub = ub;
  if(ub > VM.MEGA_UPPER_BOUND) {
    hub = p.highestUpperBound([]);
    // If UB still very high, warn modeler on infoline and in monitor.
    if(hub > VM.MEGA_UPPER_BOUND) {
      VM.logMessage(block, VM.WARNING + 'High upper bound (' +
          VM.sig4Dig(hub) + ') for "' + p.displayName +
          '" will compromise computation of its binary variables');
    }
  }
  if(hub !== ub) {
    ub = hub;
    VM.logMessage(block,
        `Inferred upper bound for ${p.displayName}: ${VM.sig4Dig(ub)}`);
  }
  const
      big_M = Math.min(VM.MEGA_UPPER_BOUND,
          Math.max(Math.abs(lb), Math.abs(ub)) + 1),
      l_index = VM.offset + p.level_var_index,
      pos_index = VM.offset + p.plus_var_index,
      neg_index = VM.offset + p.minus_var_index,
      off_index = VM.offset + p.is_zero_var_index,
      pep_index = VM.offset + p.pep_var_index,
      nep_index = VM.offset + p.nep_var_index,
      posl_index = VM.offset + p.psc_var_index,
      negl_index = VM.offset + p.nsc_var_index;
  if(DEBUGGING) {
    console.log(p.type, p.displayName, 'big M =', VM.sig4Dig(big_M));
  }
  // First "partition" the level into positive and negative "epsilon" parts
  // and "larger than epsilon" parts.
  // (a) L = POSL + PEP - NEP - NEGL
  let row = {};
  row[l_index] = 1;
  row[negl_index] = 1;
  row[nep_index] = 1;
  row[pep_index] = -1;
  row[posl_index] = -1;
  VM.matrix.push(row);
  VM.right_hand_side.push(0);
  VM.constraint_types.push(VM.EQ);
  // Note that ALL parts are non-negative values.
  // Force NEG=1 if NEGL > 0, as this means that L < -epsilon.
  // (b1) NEGL - M*NEG <= 0  (so NEG must be 1 when NEGL > 0)
  row = {};
  row[negl_index] = 1;
  row[neg_index] = -big_M;
  VM.matrix.push(row);
  VM.right_hand_side.push(0);
  VM.constraint_types.push(VM.LE);
  // (b2) NEG * epsilon - NEGL <= 0 (so NEG must be 0 when NEGL < epsilon)
  row = {};
  row[neg_index] = VM.ON_OFF_THRESHOLD;
  row[negl_index] = -1;
  VM.matrix.push(row);
  VM.right_hand_side.push(0);
  VM.constraint_types.push(VM.LE);
  // Force POS=1 if POSL > 0, as this means that L > epsilon.
  // (c1) POSL - M*POS <= 0
  row = {};
  row[posl_index] = 1;
  row[pos_index] = -big_M;
  VM.matrix.push(row);
  VM.right_hand_side.push(0);
  VM.constraint_types.push(VM.LE);
  // (c2) POS * epsilon - POSL <= 0 (so POS must be 0 when POSL < epsilon)
  row = {};
  row[pos_index] = VM.ON_OFF_THRESHOLD;
  row[posl_index] = -1;
  VM.matrix.push(row);
  VM.right_hand_side.push(0);
  VM.constraint_types.push(VM.LE);
  // (d) POS + NEG <= 1  ensures that NEGL and POSL cannot *both* be non-negative.
  row = {};
  row[pos_index] = 1;
  row[neg_index] = 1;
  VM.matrix.push(row);
  VM.right_hand_side.push(1);
  VM.constraint_types.push(VM.LE);
  // Since NEP and PEP will always have very small values (0 <= x <= epsilon),
  // the "big M" need not be big, so we use M = 2 (arbitrarily chosen).
  // (e) NEP + PEP - 2*OFF <= 0  ensures that OFF=1 if |L| < epsilon)
  row = {};
  row[nep_index] = 1;
  row[pep_index] = 1;
  row[off_index] = -2;
  VM.matrix.push(row);
  VM.right_hand_side.push(0);
  VM.constraint_types.push(VM.LE);
  // Finally, ensure that NEGL and POSL do not cancel each other out by
  // demanding that the binaries NEG and POS cannot add up to more than 1.
  // (f) POS + NEG + OFF<= 1
  row = {};
  row[pos_index] = 1;
  row[neg_index] = 1;
  row[off_index] = 1;
  VM.matrix.push(row);
  VM.right_hand_side.push(1);
  VM.constraint_types.push(VM.EQ);
}

function VMI_add_startup_constraints(p) {
  // Add constraints that set correct values for the binary
  // start-up indicator associated with process or product `p`.
  const
      neg_t = VM.offset + p.minus_var_index,
      pos_t = VM.offset + p.plus_var_index,
      su_t = VM.offset + p.start_up_var_index,
      // Indices for previous time step.
      neg_t_1 = neg_t - VM.cols,
      pos_t_1 = pos_t - VM.cols;
  // ON = POS + NEG (as of POS or NEG only one can equal 1)
  // (e) ON[t-1] - ON[t] + SU[t] >= 0
  let row = {},
      on_t_1 = 0,
      rhs = 0;
  // NOTE: Time step t-1 may fall before block start...
  if(pos_t_1 > 0) { 
    row[pos_t_1] = 1;
    row[neg_t_1] = 1;
  } else {
    // ... and in that case, use values computed for t-1.
    on_t_1 = Math.abs(p.actualLevel(VM.t - 1));
    rhs = (on_t_1 > VM.NEAR_ZERO ? -1 : 0);
  }
  row[pos_t] = -1;
  row[neg_t] = -1;
  row[su_t] = 1;
  VM.matrix.push(row);
  VM.right_hand_side.push(rhs);
  VM.constraint_types.push(VM.GE);
  // (f) ON[t] - SU[t] >= 0
  row = {};
  row[pos_t] = 1;
  row[neg_t] = 1;
  row[su_t] = -1;
  VM.matrix.push(row);
  VM.right_hand_side.push(0);
  VM.constraint_types.push(VM.GE);
  // (g) ON[t-1] + ON[t] + SU[t] <= 2
  row = {};
  rhs = 2;
  if(pos_t_1 > 0) { 
    row[pos_t_1] = 1;
    row[neg_t_1] = 1;
  } else {
    if(on_t_1 > VM.NEAR_ZERO) rhs--;
  }
  row[pos_t] = 1;
  row[neg_t] = 1;
  row[su_t] = 1;
  VM.matrix.push(row);
  VM.right_hand_side.push(rhs);
  VM.constraint_types.push(VM.LE);
}

function VMI_add_shutdown_constraints(p) {
  // Add constraints that set correct values for the binary
  // shut-down indicator associated with process or product `p`.
  const
      neg_t = VM.offset + p.minus_var_index,
      pos_t = VM.offset + p.plus_var_index,
      sd_t = VM.offset + p.shut_down_var_index,
      // Indices for previous time step.
      neg_t_1 = neg_t - VM.cols,
      pos_t_1 = pos_t - VM.cols;
  // ON = POS + NEG (as of POS or NEG only one can equal 1)
  // (e2) OO[t] - OO[t-1] + SD[t] >= 0
  let row = {},
      on_t_1 = 0,
      rhs = 0;
  row[pos_t] = 1;
  row[neg_t] = 1;
  // NOTE: Time step t-1 may fall before block start...
  if(pos_t_1 > 0) { 
    row[pos_t_1] = -1;
    row[neg_t_1] = -1;
  } else {
    // ... and in that case, use values computed for t-1.
    on_t_1 = Math.abs(p.actualLevel(VM.t - 1));
    rhs = (on_t_1 > VM.NEAR_ZERO ? 1 : 0);
  }
  row[sd_t] = 1;
  VM.matrix.push(row);
  VM.right_hand_side.push(rhs);
  VM.constraint_types.push(VM.GE);
  // (f2) OO[t] + SD[t] <= 1
  row = {};
  row[pos_t] = 1;
  row[neg_t] = 1;
  row[sd_t] = 1;
  VM.matrix.push(row);
  VM.right_hand_side.push(1);
  VM.constraint_types.push(VM.LE);
  // (g2) SD[t] - OO[t-1] - OO[t] <= 0
  row = {};
  row[sd_t] = 1;
  if(pos_t_1 > 0) {
    row[pos_t_1] = -1;
    row[neg_t_1] = -1;
    rhs = 0;
  } else {
    rhs = (on_t_1 > VM.NEAR_ZERO ? 1 : 0);
  }
  row[pos_t] = -1;
  row[neg_t] = -1;
  VM.matrix.push(row);
  VM.right_hand_side.push(rhs);
  VM.constraint_types.push(VM.LE);
}

function VMI_add_first_commit_constraints(p) {
  // Add constraints that set correct values for the binary
  // "first commit" indicator associated with process or product `p`.
  const
      sc_t = VM.offset + p.start_up_count_var_index,
      su_t = VM.offset + p.start_up_var_index,
      so_t = VM.offset + p.suc_on_var_index,
      fc_t = VM.offset + p.first_commit_var_index,
      // Indices for previous time step.
      sc_t_1 = sc_t - VM.cols,
      so_t_1 = so_t - VM.cols;
  // (h)  SC[t] - SC[t-1] - SU[t] = 0
  let row = {},
      rhs = 0,
      su_count_t_1 = 0;
  row[sc_t] = 1;
  // NOTE: Time step t-1 may fall before block start...
  if(sc_t_1 > 0) { 
    row[sc_t_1] = -1;
  } else {
    // ... and in that case, count start-ups up to and including t-1.
    const t_1 = VM.t - 1;
    let sul = p.start_ups.length;
    if(sul) {
      while(sul > 0 && p.start_ups[sul-1] > t_1) sul--;
      su_count_t_1 = sul;
    }
    rhs = su_count_t_1;
  }
  row[su_t] = -1;
  VM.matrix.push(row);
  VM.right_hand_side.push(rhs);
  VM.constraint_types.push(VM.EQ);
  // (i)  SC[t] - SO[t] >= 0
  row = {};
  row[sc_t] = 1;
  row[so_t] = -1;
  VM.matrix.push(row);
  VM.right_hand_side.push(0);
  VM.constraint_types.push(VM.GE);
  // (j)  SC[t] - run length * SO[t] <= 0
  row = {};
  row[sc_t] = 1;
  row[so_t] = -MODEL.runLength;
  VM.matrix.push(row);
  VM.right_hand_side.push(0);
  VM.constraint_types.push(VM.LE);
  // (k)  SO[t-1] - SO[t] + FC[t] >= 0
  row = {};
  rhs = 0;
  // NOTE: Time step t-1 may fall before block start...
  if(so_t_1 > 0) {
    row[so_t_1] = 1;
  } else {
    // ... and in that case, use value computed for SC.
    // Note that SO is the binary indicator for SC > 0.
    if(su_count_t_1) rhs = -1;
  }
  row[so_t] = -1;
  row[fc_t] = 1;
  VM.matrix.push(row);
  VM.right_hand_side.push(rhs);
  VM.constraint_types.push(VM.GE);
  // (l)  SO[t] - FC[t] >= 0
  row = {};
  row[so_t] = 1;
  row[fc_t] = -1;
  VM.matrix.push(row);
  VM.right_hand_side.push(0);
  VM.constraint_types.push(VM.GE);
  // (m)  SO[t-1] + SO[t] + FC[t] <= 2
  row = {};
  // NOTE: Time step t-1 may fall before block start...
  if(so_t_1 > 0) {
    row[so_t_1] = 1;
    rhs = 2;
  } else {
    // ... and in that case, use value computed for SC.
    // Note that SO is the binary indicator for SC > 0.
    rhs = (su_count_t_1 ? 1 : 2);
  }
  row[so_t] = 1;
  row[fc_t] = 1;
  VM.matrix.push(row);
  VM.right_hand_side.push(rhs);
  VM.constraint_types.push(VM.LE);
}

function VMI_add_cash_constraints(args) {
  // args = [cash IN variable index, cash OUT variable index]
  // Overwrites the coefficients vector with the cash coefficients
  // vector specified by the first argument (cash IN for production,
  // cash OUT for consumption). The second argument is passed only for
  // tracing purposes.
  if(DEBUGGING) {
    console.log('add cash constraints for ',
        VM.variables[args[0]][1].displayName, '(t = ' + VM.t + ')');
  }
  // Add a constraint for cash IN.
  let row = {};
  for(let i in VM.cash_in_coefficients) if(VM.cash_in_coefficients.hasOwnProperty(i)) {
    const
        c = VM.cash_in_coefficients[i],
        ac = Math.abs(c);
    // Do not add variables having near-zero coefficients.
    if(ac > VM.NEAR_ZERO) {
      row[i] = c;
      // NOTE: This instruction also keeps track of the highest absolute
      // cash flow constraint coefficient, so it can be used for scaling
      // these constraint equations.
      VM.cash_scalar = Math.max(VM.cash_scalar, ac);
    }
  }
  // To permit such scaling, this instruction maintains a list of cash
  // constraint row indices, as these are the equations that need to be
  // scaled once the tableau is complete.
  VM.cash_constraints.push(VM.matrix.length);
  // Set coefficient for the cash IN variable to 1.
  row[VM.offset + args[0]] = 1;
  // Add the constraint to the tableau.
  VM.matrix.push(row);
  VM.right_hand_side.push(VM.cash_in_rhs);
  VM.constraint_types.push(VM.EQ);
  // Clear the cash IN coefficient register and RHS.
  VM.cash_in_coefficients = {};
  VM.cash_in_rhs = 0;
  // Now likewise add a constraint for cash OUT.
  row = {};
  for(let i in VM.cash_out_coefficients) if(VM.cash_out_coefficients.hasOwnProperty(i)) {
    const
        c = VM.cash_out_coefficients[i],
        ac = Math.abs(c);
    if(ac > VM.NEAR_ZERO) {
      row[i] = c;
      VM.cash_scalar = Math.max(VM.cash_scalar, ac);
    }
  }
  VM.cash_constraints.push(VM.matrix.length);
  // Add the cash OUT variable index.
  row[VM.offset + args[1]] = 1;
  // Add the constraint to the tableau.
  VM.matrix.push(row);
  VM.right_hand_side.push(VM.cash_out_rhs);
  VM.constraint_types.push(VM.EQ);
  // Clear the cash OUT coefficients register and RHS (just to be sure).
  VM.cash_out_coefficients = {};
  VM.cash_out_rhs = 0;
}

function VMI_add_grid_process_constraints(p) {
  // Add constraints that will ensure that loss slopes properties are set.  
  const gpv = VM.gridProcessVarIndices(p, VM.offset);
  if(!gpv) return;
  // Now the variable index lists all contain 1, 2 or 3 indices,
  // depending on the loss approximation level.
  let ub = p.upper_bound.result(VM.t);
  if(ub >= VM.PLUS_INFINITY) {
    // When UB = +INF, this is interpreted as "unlimited", which is
    // implemented as 99999 grid power units.
    ub = VM.UNLIMITED_POWER_FLOW;
  }
  const
      step = ub / gpv.slopes,
      // NOTE: For slope 1 use a small positive number as LB.
      lbs = [VM.ON_OFF_THRESHOLD, step, 2*step],
      ubs = [step, 2*step, 3*step],
      // NOTE: Grid processes also have the NPZ-partitioning variables.
      posl_index = VM.offset + p.psc_var_index,
      negl_index = VM.offset + p.nsc_var_index;
  for(let i = 0; i < gpv.slopes; i++) {
    // Add constraints to set the ON/OFF binary for each slope:
    VMI_clear_coefficients();
    //   level - UB*binary <= 0
    VM.coefficients[gpv.up[i]] = 1;
    VM.coefficients[gpv.up_on[i]] = -ubs[i];
    VMI_add_constraint(VM.LE);
    //   level - LB*binary >= 0
    VMI_clear_coefficients();
    VM.coefficients[gpv.up[i]] = 1;
    VM.coefficients[gpv.up_on[i]] = -lbs[i];
    VMI_add_constraint(VM.GE);
    // Two similar constraints for the Down slope
    VMI_clear_coefficients();
    VM.coefficients[gpv.down[i]] = 1;
    VM.coefficients[gpv.down_on[i]] = -ubs[i];
    VMI_add_constraint(VM.LE);
    VMI_clear_coefficients();
    VM.coefficients[gpv.down[i]] = 1;
    VM.coefficients[gpv.down_on[i]] = -lbs[i];
    VMI_add_constraint(VM.GE);
  }
  // Sum of all Up variables must be equal to POSL.
  VMI_clear_coefficients();
  VM.coefficients[posl_index] = -1;
  for(let i = 0; i < gpv.slopes; i++) {
    VM.coefficients[gpv.up[i]] = 1;
  }
  VMI_add_constraint(VM.EQ);
  // Sum of all Down variables must be equal to NEGL.
  VMI_clear_coefficients();
  VM.coefficients[negl_index] = -1;
  for(let i = 0; i < gpv.slopes; i++) {
    VM.coefficients[gpv.down[i]] = 1;
  }
  VMI_add_constraint(VM.EQ);
  // Sum of all slope binaries must be <= 1.
  VMI_clear_coefficients();
  for(let i = 0; i < gpv.slopes; i++) {
    VM.coefficients[gpv.up_on[i]] = 1;
    VM.coefficients[gpv.down_on[i]] = 1;
  }
  VM.rhs = 1;
  VMI_add_constraint(VM.LE);
}

function VMI_add_kirchhoff_constraints(cb) {
  // Add Kirchhoff's voltage law constraint for each cycle in `cb`.
  // NOTE: Do not add a constraint for cyles that have been "broken"
  // because one or more of its processes have UB = 0.
  for(const c of cb) {
    let not_broken = true;
    VMI_clear_coefficients();
    for(const e of c) {
      const
          p = e.process,
          x = p.length_in_km * p.grid.reactancePerKm,
          o = e.orientation,
          ub = p.upper_bound.result(VM.t);
      if(ub <= VM.NEAR_ZERO) {
        not_broken = false;
        break;
      }
      VM.coefficients[VM.offset + p.level_var_index] = x * o;
    }
    if(not_broken) VMI_add_constraint(VM.EQ);
  }
}

function VMI_add_power_flow_to_coefficients(args) {
  // Special instruction to add power flow rates represented by process
  // P to the coefficient vector that is being constructed to compute the
  // level for product Q.
  // The instruction is added once for the link P -> Q (then UP flows
  // add to the level of Q, while DOWN flows subtract) and once for the
  // link Q -> P (then UP flows *subtract* from the level of Q while
  // DOWN flows *add*).
  // The instruction expects two arguments: a grid process and an integer
  // indicating the direction: P -> Q (1) or Q -> P (-1).
  const
      p = args[0],
      up = args[1] > 0,
      gpv = VM.gridProcessVarIndices(p, VM.offset),
      lr = p.lossRates(VM.t);
  for(let i = 0; i < gpv.slopes; i++) {
    // Losses must be subtracted only from flows *into* P.
    const
        uv = (up ? 1 - lr[i] : -1),
        dv = (up ? -1 : 1 - lr[i]);
    let k = gpv.up[i];
    if(k in VM.coefficients) {
      VM.coefficients[k] += uv;
    } else {
      VM.coefficients[k] = uv;
    }
    k = gpv.down[i];
    if(k in VM.coefficients) {
      VM.coefficients[k] += dv;
    } else {
      VM.coefficients[k] = dv;
    }
  }
  // Also add the epsilon variables.
  VM.coefficients[p.pep_var_index + VM.offset] = args[1];
  VM.coefficients[p.nep_var_index + VM.offset] = -args[1];
}

function VMI_add_throughput_to_coefficients(link) {
  // Special instruction to deal with throughput calculation.
  // Parameter `link` is the link Y -> Z from (data) product Y for which
  // throughput is to be computed and added to Z. As Z may have other
  // input links as well, this instruction only adds coefficients to the
  // constraint that computes the level of Z.
  const p = link.from_node;
  // Double-check whether FROM node is a product.
  if(!(p instanceof Product)) return;
  // NOTE: The link Y -> Z has a rate and potentially a delay, so compute
  // these first.
  const
      d1 = link.actualDelay(VM.t),
      r1 = link.relative_rate.result(VM.t);
  if(!r1) return;
  if(DEBUGGING) {
    console.log('add_throughput_to_coefficient: ' + link.displayName +
        ` (t = ${VM.t}, rate = ${r1})`);
  }
  // Throughput is defined as the total inflow into Y over links Xi-->Y
  // having rate Ri and potentially also delay Di.
  for(const l of p.inputs) {
    const
        d2 = l.actualDelay(VM.t),
        // NOTE: Use earlier rate when throughput link has a delay. 
        r2 = l.relative_rate.result(VM.t - d1),
        lfn = l.from_node;
    // Skip link when it has rate = 0.
    if(r2 === 0) continue;
    // By default, use the FROM node's level...
    let vi = (lfn.is_zero_var_index < 0 ? lfn.level_var_index :
        // ... but differentiate when this level is NZP-partitioned.
        // Then use positive level component when rate > 0, and negative
        // level component when rate < 0, so throughput flow is always >= 0.
        (r2 > 0 ? lfn.psc_var_index : lfn.nsc_var_index));
    // The link multiplier may require another variable index.
    if(l.multiplier === VM.LM_POSITIVE) {
      vi = lfn.plus_var_index;
    } else if (l.multiplier === VM.LM_ZERO) {
      vi = lfn.is_zero_var_index;
    } else if (l.multiplier === VM.LM_NEGATIVE) {
      vi = lfn.minus_var_index;
    } else if(l.multiplier === VM.LM_STARTUP) {
      vi = lfn.start_up_var_index;
    } else if(l.multiplier === VM.LM_FIRST_COMMIT) {
      vi = lfn.first_commit_var_index;
      // NOTE: If `p` has a non-zero initial value, first commit links
      // are ignored.
      if(vi < 0) continue;
    } else if(l.multiplier === VM.LM_SHUTDOWN) {
      vi = lfn.shut_down_var_index;
    }
    // When X affects the level of Z because Z "reads" the throughput of Y,
    // so X --(r2,d2)--> Y --(r1,d1)--> Z, the correct coefficient of X is
    // r1[t] * r2[t-d1] * X[t-d1-d2]
    const
        dsum = d1 + d2,
        k = VM.offset + vi - dsum * VM.cols,
        t = VM.t - dsum;
    // Ignore "future variables".
    if(k > VM.chunk_offset) continue;
    if(k <= 0) {
      // NOTE: subtract 1 from var_index because VM.variables is a 0-based array.
      const vbl = VM.variables[vi - 1];
      if(DEBUGGING) {
        console.log('--lookup[' + k + ']: ' + vbl[0] + ' ' + vbl[1].displayName);
      }
      // X has been computed in a previous block => subtract term from RHS.
      // NOTE: Only when X * r2 >= 0.
      VM.rhs -= Math.max(0, VM.priorValue(vbl, t) * r2) * r1;
    } else if(k in VM.coefficients) {
      VM.coefficients[k] += r1 * r2;
    } else {
      VM.coefficients[k] = r1 * r2;
    }
  }
  // NOTE: Processes Y -> Xi typically consume Y, but *may* create an inflow into Y
  // when they have level < 0. Hence also iterate over links Y -> Xi.
  // NOTE: Such links cannot have a delay.
  for(const l of p.outputs) {
    const ltn = l.to_node;
    // NOTE: Skip links to products, as these will always be data links.
    if(ltn instanceof Product) continue;
    // NOTE: The throughput link may still have a delay. 
    const r2 = l.relative_rate.result(VM.t - d1);
    // Skip link when it has rate = 0.
    if(r2 === 0) continue;
    // Also skip when level is not NZP-partitioned, as then an output-link
    // cannot contribute to the *inflow* of the process being "read".
    if(ltn.is_zero_var_index < 0) continue;
    // Now use the negative level component when rate > 0, and positive
    // level component when rate < 0, so throughput flow is always >= 0.
    const
        vi = (r2 > 0 ? ltn.nsc_var_index : ltn.psc_var_index),
        k = VM.offset + vi - d1 * VM.cols,
        t = VM.t - d1;
    // Ignore "future variables".
    if(k > VM.chunk_offset) continue;
    if(k <= 0) {
      // NOTE: subtract 1 from var_index because VM.variables is a 0-based array.
      const vbl = VM.variables[vi - 1];
      if(DEBUGGING) {
        console.log('--lookup[' + k + ']: ' + vbl[0] + ' ' + vbl[1].displayName);
      }
      // X has been computed in a previous block => subtract term from RHS.
      VM.rhs -= Math.max(0, VM.priorValue(vbl, t) * r2) * r1;
    } else if(k in VM.coefficients) {
      VM.coefficients[k] += r1 * r2;
    } else {
      VM.coefficients[k] = r1 * r2;
    }
  }
}

function VMI_add_bound_line_constraint(args) {
  // `args`: [variable index for X, LB expression for X, UB expression for X,
  //          variable index for Y, LB expression for Y, UB expression for Y,
  //          boundline object]
  const
      vix = args[0],
      vx = VM.variables[vix - 1],  // `variables` is zero-based!
      objx = vx[1],
      ubx = args[2].result(VM.t),
      viy = args[3],
      vy = VM.variables[viy - 1],
      objy= vy[1],
      uby = args[5].result(VM.t),
      bl = args[6];
  // Set bound line point coordinates for current run and time step.
  bl.setDynamicPoints(VM.t);
  // Then use the actualized points.
  const
      n = bl.points.length,
      x = new Array(n),
      y = new Array(n),
      w = new Array(n);
  if(DEBUGGING) {
    console.log('add_bound_line_constraint:', bl.displayName);
  }
  // Do not add constraints for bound lines that set no infeasible area.
  if(!bl.constrainsY) {
    if(DEBUGGING) {
      console.log('SKIP because bound line does not constrain');
    }
    return;
  }
  // NOTE: For semi-continuous processes, lower bounds > 0 should to be
  // adjusted to 0, as then 0 is part of the process level range.
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

  // Since version 2.0.0, the `use_binaries` flag can no longer be determined
  // at compile time, as bound lines may be dynamic. When use_binaries = TRUE,
  // additional constraints on binary variables are needed (see below).
  let use_binaries = VM.noSupportForSOS && !bl.needsNoSOS;

  // Scale X and Y and compute the block indices of w[i]
  let wi = VM.offset + bl.first_sos_var_index;
  const
      rx = (ubx - lbx) / 100,
      ry = (uby - lby) / 100;
  for(let i = 0; i < n; i++) {
    x[i] = lbx + bl.points[i][0] * rx;
    y[i] = lby + bl.points[i][1] * ry;
    w[i] = wi;
    wi++;
  }
  // Add constraint (1):
  VMI_clear_coefficients();
  for(const wi of w) VM.coefficients[wi] = 1;
  VM.rhs = 1;
  VMI_add_constraint(VM.EQ);
  // Add constraint (2):
  VMI_clear_coefficients();
  VM.coefficients[VM.offset + vix] = 1;
  for(let i = 0; i < w.length; i++) {
    VM.coefficients[w[i]] = -x[i];
  }
  // No need to set RHS as it is already reset to 0.
  VMI_add_constraint(VM.EQ);
  // Add constraint (3):
  VMI_clear_coefficients();
  VM.coefficients[VM.offset + viy] = 1;
  for(let i = 0; i < w.length; i++) {
    VM.coefficients[w[i]] = -y[i];
  }
  if(VM.diagnose && !bl.constraint.no_slack) {
    // Add coefficients for slack variables unless omitted.
    if(bl.type != VM.LE) VM.coefficients[VM.offset + bl.GE_slack_var_index] = 1;
    if(bl.type != VM.GE) VM.coefficients[VM.offset + bl.LE_slack_var_index] = -1;
  }
  // No need to set RHS as it is already reset to 0.
  VMI_add_constraint(bl.type);
  // NOTE: SOS variables w[i] have bounds [0, 1], but these have not been
  // set yet.
  for(const wi of w) {
    VM.lower_bounds[wi] = 0; 
    VM.upper_bounds[wi] = 1;
  }
  // NOTE: Some solvers do not support SOS. To ensure that only 2
  // adjacent w[i]-variables can be non-zero (they range from 0 to 1),
  // as many binary variables b[i] are defined, and the following
  // constraints are added:
  //   w[1] <= b[1]
  //   W[2] <= b[1] + b[2]
  //   W[3] <= b[2] + b[3]
  // and so on for all pairs of consecutive binaries, until finally:
  //   w[N] <= b[N]
  // and then to ensure that at most 2 binaries can be 1:
  //   b[1] + ... + b[N] <= 2
  // NOTE: These additional variables and constraints are not needed
  // when a bound line defines a convex feasible area.
  if(use_binaries) {
    // Add the constraints mentioned above. The index of b[i] is the
    // index of w[i] plus the number of points on the boundline N.
    VMI_clear_coefficients();
    VM.coefficients[w[0]] = 1;
    VM.coefficients[w[0] + n] = -1;
    VMI_add_constraint(VM.LE);  // w[1] - b[1] <= 0
    VMI_clear_coefficients();
    for(let i = 1; i < n - 1; i++) {
      VMI_clear_coefficients();
      VM.coefficients[w[i]] = 1;
      VM.coefficients[w[i] + n - 1] = -1;
      VM.coefficients[w[i] + n] = -1;
      VMI_add_constraint(VM.LE);  // w[i] - b[i-1] - b[i] <= 0
    }
    VMI_clear_coefficients();
    VM.coefficients[w[n - 1]] = 1;
    VM.coefficients[w[n - 1] + n] = -1;
    VMI_add_constraint(VM.LE);  // w[N] - b[N] <= 0
    // Add last constraint: sum of binaries must be <= 2.
    VMI_clear_coefficients();
    for(const wi of w) VM.coefficients[wi + n] = 1;
    VM.rhs = 2;
    VMI_add_constraint(VM.LE);
  }
}

function VMI_add_peak_increase_constraints(p) {
  // Add constraints to compute peak increase for current block and
  // for current block + look-ahead.
  const
      vi = p.level_var_index, // tableau column of L[t]
      cvi = p.peak_inc_var_index, // tableau column of peak
      lci = VM.offset + vi,
      cbici = VM.chunk_offset + cvi,
      cvbl = VM.chunk_variables[cvi][1];
  if(DEBUGGING) {
    console.log('add_peak_level_constraints (t = ' + VM.t + ')',
        VM.variables[vi - 1][0], VM.variables[vi - 1][1].displayName,
        VM.chunk_variables[cvi][0], cvbl.displayName);
  }
  // For t = 1 to block length, add constraint to compute block peak increase.
  if(VM.offset < MODEL.block_length * VM.cols) {
    // (n) L[t] - BPI[b] <= BP[b-1]  (where b denotes the block number)
    VMI_clear_coefficients();
    VM.coefficients[lci] = 1;
    VM.coefficients[cbici] = -1;
    // Set RHS to highest level computed in previous blocks.
    VM.rhs = cvbl.b_peak[VM.block_count - 1];
    VMI_add_constraint(VM.LE);
    return;
  }
  // For every t = block length + 1 to chunk length:
  VMI_clear_coefficients();
  // (o) L[t] - BPI[b] - CPI[b] <= BP[b-1]
  VM.coefficients[lci] = 1;
  VM.coefficients[cbici] = -1;
  // NOTE: Next index always points to LA peak increase.
  VM.coefficients[cbici + 1] = -1;
  // Set RHS to highest level computed in previous blocks.
  VM.rhs = cvbl.b_peak[VM.block_count - 1];
  VMI_add_constraint(VM.LE);
}

function VMI_add_peak_increase_at_t_0(args) {
  // This operation should result in adding peak increase[b] * link rate
  // to the product level for which a constraint is being defined.
  // This means that the coefficient for (B or LA) peak increase[b] must
  // equal the link rate.
  // NOTE: Only execute this operation at start of block or of LA period.
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

function VMI_add_max_increase(link) {
  // Adds the "maximum increase" (ramp-up) of the FROM node (process) to
  // the level of the TO node (data product) while considering the delay.
  // NOTE: New instruction style that passes pointers to model entities
  // instead of their properties.
  const
      d = link.actualDelay(VM.t),
      fn = link.from_node,
      fnvi = fn.level_var_index,
      // Column number in the tableau.
      fnk = VM.offset + fnvi - d * VM.cols,
      // Use flow rate and upper bound for t minus delay.
      t = VM.t - d,
      r = link.relative_rate.result(t),
      u = fn.upper_bound.result(t);
  if(DEBUGGING) {
    console.log('VMI_add_max_increase (t = ' + VM.t + ')',
        link.displayName, 'UB', u, 'rate', r);
  }
  // Maximum increase equals UB - level, so subtract UB * rate from RHS...
  VM.rhs -= u * r;
  // ... and subtract rate from FROM node coefficient. 
  if(fnk <= 0) {
    // NOTE: If `fnk` falls PRIOR to the start of the block being solved,
    // this means that the value of the decision variable X for which the
    // coefficient C is to be set by this instruction has been calculated
    // while solving a previous block. Since the value of X is known,
    // adding X*rate to C is implemented as subtracting X*rate from the
    // right hand side of the constraint.
    VM.rhs += knownValue(fnvi, t) * r;
  } else if(fnk in VM.coefficients) {
    VM.coefficients[fnk] -= r;
  } else {
    VM.coefficients[fnk] = -r;
  }
}

function VMI_add_max_decrease(link) {
  // Adds the "maximum decrease" (ramp-down) of the FROM node (process) to
  // the level of the TO node (data product) while considering the delay.
  // NOTE: New instruction style that passes pointers to model entities
  // instead of their properties.
  const
      d = link.actualDelay(VM.t),
      fn = link.from_node,
      fnvi = fn.level_var_index,
      // Column number in the tableau.
      fnk = VM.offset + fnvi - d * VM.cols,
      // Use flow rate and upper bound for t minus delay.
      t = VM.t - d,
      r = link.relative_rate.result(t),
      l = fn.lower_bound.result(t);
  if(DEBUGGING) {
    console.log('VMI_add_max_decrease (t = ' + VM.t + ')',
        link.displayName, 'LB', l, 'rate', r);
  }
  // Maximum decrease equals -LB + level, so add LB * rate to RHS...
  VM.rhs += l * r;
  // ... and subtract rate from FROM node coefficient. 
  if(fnk <= 0) {
    // See corresponding NOTEs for VMI_add_max_increase.
    VM.rhs -= knownValue(fnvi, t) * r;
  } else if(fnk in VM.coefficients) {
    VM.coefficients[fnk] += r;
  } else {
    VM.coefficients[fnk] = r;
  }
}

function VMI_add_spinning_reserve(link) {
  // Adds the "spinning reserve" of the FROM node (process) to the
  // level of the TO node (data product) while considering the delay.
  // NOTE: New instruction style that passes pointers to model entities
  // instead of their properties.
  const
      d = link.actualDelay(VM.t),
      fn = link.from_node,
      fnvi = fn.level_var_index,
      // Column number of FROM node level index in the tableau.
      fnk = VM.offset + fnvi - d * VM.cols,
      // Use flow rate and bounds for t minus delay.
      t = VM.t - d,
      r = link.relative_rate.result(t),
      l = link.from_node.lower_bound.result(t),
      u = link.from_node.upper_bound.result(t);
  if(DEBUGGING) {
    console.log('VMI_add_spinning_reserve (t = ' + VM.t + ')',
        link.displayName, 'LB', l, 'UB', u, 'rate', r);
  }
  if(fnk <= 0) {
    // NOTE: If `fnk` falls PRIOR to the start of the block being solved,
    // this means that the value of the decision variable X for which the
    // coefficient C is to be set by this instruction has been calculated
    // while solving a previous block.
    const x = knownValue(fnvi, t);
    if(Math.abs(x) > VM.ON_OFF_THRESHOLD) {
      // Spinning reserve is relative to LB if X < 0, and to UB is X > 0,
      // but the result will always be >= 0.
      const spinres = (x < 0 ? x - l : u - x);
      // "Add" it to the TO node by adding it to the RHS.
      if(spinres > VM.NEAR_ZERO) VM.rhs += reserve * r;
    }
  } else {
    // NOTE: Use *both* the (mutually exclusive) POS and NEG levels.
    const
      posk = VM.offset + fn.plus_var_index - d * VM.cols,
      poslk = VM.offset + fn.psc_var_index - d * VM.cols,
      negk = VM.offset + fn.minus_var_index - d * VM.cols,
      neglk = VM.offset + fn.nsc_var_index - d * VM.cols;    
    if(posk in VM.coefficients) {
      VM.coefficients[posk] += u * r;
    } else {
      VM.coefficients[posk] = u * r;
    }
    if(poslk in VM.coefficients) {
      VM.coefficients[poslk] -= r;
    } else {
      VM.coefficients[poslk] = -r;
    }
    if(negk in VM.coefficients) {
      VM.coefficients[negk] += -l * r;
    } else {
      VM.coefficients[negk] = -l * r;
    }
    if(neglk in VM.coefficients) {
      VM.coefficients[neglk] -= r;
    } else {
      VM.coefficients[neglk] = -r;
    }
  }
}


// NOTE: the global constants below are not defined in linny-r-globals.js
// because some comprise the identifiers of functions for VM instructions

const
  // Valid symbols in expressions
  PARENTHESES = '()',
  OPERATOR_CHARS = ';?:+-*/%=!<>^|@',
  // Opening bracket, space and single quote indicate a separation
  SEPARATOR_CHARS = PARENTHESES + OPERATOR_CHARS + "[ '",
  COMPOUND_OPERATORS = ['!=', '<>', '>=', '<=', '//'],
  CONSTANT_SYMBOLS = [
      't', 'rt', 'bt', 'ct', 'b', 'N', 'n', 'l', 'r', 'lr', 'nr', 'x', 'nx',
      'random', 'dt', 'true', 'false', 'pi', 'infinity', 'epsilon', '#',
      'i', 'j', 'k', 'yr', 'wk', 'd', 'h', 'm', 's'],
  CONSTANT_CODES = [
      VMI_push_time_step, VMI_push_relative_time, VMI_push_block_time,
      VMI_push_chunk_time,
      VMI_push_block_number, VMI_push_run_length, VMI_push_block_length,
      VMI_push_look_ahead, VMI_push_round, VMI_push_last_round,
      VMI_push_number_of_rounds, VMI_push_run_number, VMI_push_number_of_runs,
      VMI_push_random, VMI_push_delta_t, VMI_push_true, VMI_push_false,
      VMI_push_pi, VMI_push_infinity, VMI_push_epsilon, VMI_push_contextual_number,
      VMI_push_i, VMI_push_j, VMI_push_k,
      VMI_push_year, VMI_push_week, VMI_push_day, VMI_push_hour,
      VMI_push_minute, VMI_push_second],
  DYNAMIC_SYMBOLS = ['t', 'rt', 'bt', 'ct', 'b', 'r', 'random', 'i', 'j', 'k'],
  MONADIC_OPERATORS = [
      '~', 'not', 'abs', 'sin', 'cos', 'atan', 'ln',
      'exp', 'sqrt', 'round', 'int', 'fract', 'min', 'max',
      'binomial', 'exponential', 'normal', 'poisson', 'triangular',
      'weibull', 'mpp', 'npv'],
  MONADIC_CODES = [
      VMI_negate, VMI_not, VMI_abs, VMI_sin, VMI_cos, VMI_atan, VMI_ln,
      VMI_exp, VMI_sqrt, VMI_round, VMI_int, VMI_fract, VMI_min, VMI_max,
      VMI_binomial, VMI_exponential, VMI_normal, VMI_poisson, VMI_triangular,
      VMI_weibull, VMI_mpp, VMI_npv],
  DYADIC_OPERATORS = [
      ';', '?', ':', 'or', 'and',
      '=', '<>', '!=', '>', '<', '>=', '<=',
      '@', '+', '-', '*', '/', '//',
      '%', '^', 'log', '|'],
  DYADIC_CODES = [
      VMI_concat, VMI_if_then, VMI_if_else, VMI_or, VMI_and,
      VMI_eq, VMI_ne, VMI_ne, VMI_gt, VMI_lt, VMI_ge, VMI_le,
      VMI_at, VMI_add, VMI_sub, VMI_mul, VMI_div, VMI_div_zero,
      VMI_mod, VMI_power, VMI_log, VMI_replace_undefined],

  // Compiler checks for random codes as they make an expression dynamic
  RANDOM_CODES = [VMI_binomial, VMI_exponential, VMI_normal, VMI_poisson,
      VMI_triangular, VMI_weibull],
  
  // Compiler checks for reducing codes to unset its "concatenating" flag
  REDUCING_CODES = [VMI_at, VMI_min, VMI_max, VMI_binomial, VMI_normal,
      VMI_triangular, VMI_weibull, VMI_mpp, VMI_npv],
  
  // Custom operators may make an expression level-based
  LEVEL_BASED_CODES = [],
  
  OPERATORS = DYADIC_OPERATORS.concat(MONADIC_OPERATORS), 
  OPERATOR_CODES = DYADIC_CODES.concat(MONADIC_CODES),
  PRIORITIES = [1, 2, 2, 3, 4, 5, 5, 5, 5, 5, 5, 5,
      // NOTE: The new @ operator has higher priority than comparisons,
      // and lower than arithmetic operators.
      5.5, 6, 6, 7, 7, 7, 7, 8, 8, 10,
      9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9],
  ACTUAL_SYMBOLS = CONSTANT_SYMBOLS.concat(OPERATORS),
  SYMBOL_CODES = CONSTANT_CODES.concat(OPERATOR_CODES);

//
// *** API section for custom operators ***
//

// Custom operators are typically used to implement computations on model
// results that cannot be coded (efficiently) using standard expressions.
// The first custom operator in this section demonstrates by example how
// custom operators can be added.

// Custom operators should preferably have a short alphanumeric string as
// their identifying symbol. Custom operators are monadic and reducing,
// i.e., they must have a grouping as operand. The number of required
// arguments must be checked at run time by the VM instruction for this
// operator.

// Each custom operator must have its own Virtual Machine instruction
  
function VMI_profitable_units(x) {
  // Replace the argument list that should be at the top of the stack by
  // the number of profitable units having a standard capacity (number),
  // given the level (vector) of the process that represents multiple such
  // units, the marginal cost (constant) and the market price (vector).
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
    // Valid parameters => get the data required for computation.
    const
        mup = d[0].entity, // the multi-unit process
        ub = mup.upper_bound.result(0), // NOTE: UB is assumed to be static 
        uc = d[1], // the single unit capacity
        mc = d[2], // the marginal cost
        mpe = d[3].entity, // the market price entity
        mpa = d[3].attribute,
        pt = (d.length > 4 ? d[4] : 0), // the profit threshold (0 by default)
        // the time horizon (by default the length of the simulation period)
        nt = (d.length > 5 ? d[5] : VM.nr_of_time_steps); 
    // Handle exceptional values of `uc` and `mc`.
    if(uc <= VM.BEYOND_MINUS_INFINITY || mc <= VM.BEYOND_MINUS_INFINITY) {
      x.retop(Math.min(uc, mc));
      return;
    }
    if(uc >= VM.BEYOND_PLUS_INFINITY || mc >= VM.BEYOND_PLUS_INFINITY) {
      x.retop(Math.max(uc, mc));
      return;
    }
    
    // NOTE: NPU is not time-dependent => result is stored in cache.
    // As expressions may contain several NPU operators, create a unique
    // key based on its parameters.
    const cache_key = ['npu', mup.code, ub, uc, mc, mpe.code, mpa, pt].join('_');
    if(x.cache[cache_key]) {
      x.retop(x.cache[cache_key]);
      return;
    }
    
    // `mp` can be a single value, a vector, or an expression.
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
      // NOTE: An expression may not have been (fully) computed yet.
      mp.compute(0);
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


function VMI_highest_cumulative_consecutive_deviation(x) {
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
    // NOTE: Equations can also be passed by reference.
    if(e === MODEL.equations_dataset) {
      const x = e.modifiers[a].expression;
      // NOTE: an expression may not have been (fully) computed yet.
      x.compute(0);
      if(!x.isStatic) {
        const nt = VM.nr_of_time_steps;
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
      // based on its parameters.
      const cache_key = ['hccd', e.identifier, a, block_size, first, last].join('_');
      if(x.cache[cache_key]) {
        x.retop(x.cache[cache_key]);
        return;
      }
      
      if(DEBUGGING) console.log(`*${vmi} for ${name}`);
      
      // Compute the aggregated vector and sum.
      let sum = 0,
          b = 0,
          n = 0,
          av = [];
      for(let i = first; i <= last; i++) {
        const v = vector[i];
        // Handle exceptional values in vector.
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
      // Always push the remaining block sum, even if it is 0.
      av.push(b);
      // Compute the mean (per block)
      const mean = sum / av.length;
      let hccd = 0,
          positive = av[0] > mean;
      sum = 0;
      // Iterate over the aggregated vector.
      for(const v of av) {
        if((positive && v < mean) || (!positive && v > mean)) {
          hccd = Math.max(hccd, Math.abs(sum));
          sum = v;
          positive = !positive;
        } else {
          // No sign change => add deviation.
          sum += v;
        }
      }
      hccd = Math.max(hccd, Math.abs(sum));
      // Store the result in the expression's cache.
      x.cache[cache_key] = hccd;
      // Push the result onto the stack.
      x.retop(hccd);
      return;
    }
  }
  // Fall-trough indicates error.
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

function correlation_or_slope(x, c_or_s) {
  // Replaces the argument list that should be at the top of the stack by
  // either Spearman's correlation (r) or the slope (b) of the regression
  // line y = a + bx for the two vectors X and Y that are passed as the
  // two arguments of this function. Reason to combine these two statistics
  // in one function is because the required operations are very similar.
  // NOTES:
  // (1) This function codes for two different operators and therefore
  //     is a helper function. The two operators must each have their
  //     own VM instruction -- see immediately after this function.
  // (2) String `c_or_s` must be either 'correl' or 'slope'. 
  // (3) The operands for this function must be vectors, not numbers,
  //     so in the Linny-R expression they must be passed "by reference".
  const
      d = x.top(),
      vmi = c_or_s;
  // Check whether the top stack element is a grouping of two variables.
  if(d instanceof Array && d.length === 2 &&
      typeof d[0] === 'object' && d[0].hasOwnProperty('entity') &&
      typeof d[1] === 'object' && d[1].hasOwnProperty('entity')) {
    // Convert the two variables to vectors.
    const vector = {x: {}, y: {}};
    for(let k in vector) if(vector.hasOwnProperty(k)) {
      const
          i = ['x', 'y'].indexOf(k),
          e = d[i].entity,
          a = d[i].attribute;
      vector[k].e = e;
      vector[k].a = a;
      vector[k].v = e.attributeValue(a);
      vector[k].name = e.displayName + (a ? '|' + a : '');
      vector[k].id = e.identifier;
      // NOTE: Equations can also be passed by reference.
      if(e === MODEL.equations_dataset) {
        const eq = e.modifiers[UI.nameToID(a)].expression;
        // Level-based equations require that the model has run.
        if(eq.is_level_based && !MODEL.solved) {
          x.retop(VM.NOT_COMPUTED);
          return;
        }
        // NOTE: An equation may not have been (fully) computed yet.
        eq.compute(0, x.wildcard_vector_index);
        if(!eq.isStatic) {
          const nt = VM.nr_of_time_steps;
          for(let t = 1; t <= nt; t++) eq.result(t, x.wildcard_vector_index);
        }
        vector[k].v = eq.vector;
      }
    }
    // If either operand is level-based, return "not computed" if the
    // model has not been run yet.
    if((VM.level_based_attr.indexOf(vector.x.a) >= 0 ||
        VM.level_based_attr.indexOf(vector.y.a) >= 0) &&
            !MODEL.solved) {
      x.retop(VM.NOT_COMPUTED);
      return;
    }
    if(Array.isArray(vector.x.v) && Array.isArray(vector.y.v)) {
      // Valid parameters => compute the terms used in the formulas
      // for correlation (r) and regression (slope and intercept)
      // NOTE: Statistics are not time-dependent, so the result is stored
      // in the expression's cache. As expressions may contain several
      // correl and slope operators, create a unique key based on the
      // operator name and its two operands.
      const cache_key = [vmi, vector.x.id, vector.x.a,
          vector.y.id, vector.y.a].join('_');
      if(x.cache[cache_key]) {
        x.retop(x.cache[cache_key]);
        return;
      }
      if(DEBUGGING) {
        console.log(`-- ${vmi}(${vector.x.name}, ${vector.y.name})`);
      }
      // NOTE: Vectors should have equal length.
      const N = Math.min(vector.x.v.length, vector.y.v.length);
      if(!N) {
        // No data => result should be "division by zero"
        x.retop(VM.DIV_ZERO);
        return;
      }
      // Calculate dsq = N*variance for X and Y. 
      for(let k in vector) if(vector.hasOwnProperty(k)) {
        let sum = 0;
        // NOTE: Ignore first element of vector (t=0).
        for(let i = 1; i < N; i++) {
          const v = vector[k].v[i];
          // Handle exceptional values in vector.
          if(v <= VM.BEYOND_MINUS_INFINITY || v >= VM.BEYOND_PLUS_INFINITY) {
            x.retop(v);
            return;
          }
          sum += v;
        }
        vector[k].sum = sum;
        const mean = sum / N;
        vector[k].mean = mean;
        let dsq = 0;
        // NOTE: Ignore first element of vector (t=0).
        for(let i = 1; i < N; i++) {
          const d = vector[k].v[i] - mean;
          dsq += d * d;
        }
        vector[k].dsq = dsq;
      }
      // Divisor is sqrt(dsqX * dsqY). If zero, return #DIV/0
      const divisor = Math.sqrt(vector.x.dsq * vector.y.dsq);
      if(divisor < VM.NEAR_ZERO) {
        x.retop(VM.DIV_ZERO);
        return;
      }
      // Calculate N*covariance of X and Y.
      let covar = 0;
      // NOTE: Ignore first element of vector (t=0).
      for(let i = 1; i < N; i++) {
        covar += (vector.x.v[i] - vector.x.mean) * (vector.y.v[i] - vector.y.mean);
      }
      // Correlation = covarXY / sqrt(dsqX * dsqY), slope = covarXY / dsqX.
      // NOTE: dsqX will be non-zero (or divisor would have been zero).
      const result = covar / (vmi === 'correl' ? divisor : vector.x.dsq);
      // Store the result in the expression's cache.
      x.cache[cache_key] = result;
      // Push the result onto the stack.
      x.retop(result);
      return;
    }
  }
  // Fall-trough indicates error
  if(DEBUGGING) console.log(vmi + ': invalid parameter(s)\n', d);
  x.retop(VM.PARAMS);
}

// NOTE: Separate function for each operator: VMI_correl and VMI_slope.

function VMI_correlation(x) {
  correlation_or_slope(x, 'correl');
}

// Add the custom operator instruction to the global lists
// NOTE: All custom operators are monadic (priority 9) and reducing
OPERATORS.push('correl');
MONADIC_OPERATORS.push('correl');
ACTUAL_SYMBOLS.push('correl');
OPERATOR_CODES.push(VMI_correlation);
MONADIC_CODES.push(VMI_correlation);
REDUCING_CODES.push(VMI_correlation);
SYMBOL_CODES.push(VMI_correlation);
PRIORITIES.push(9);
// Add to this list only if operation makes an expression dynamic
// DYNAMIC_SYMBOLS.push('...');
// Add to this list only if operation makes an expression random
// RANDOM_CODES.push(VMI_...);
// Add to this list only if operation makes an expression level-based
// LEVEL_BASED_CODES.push(VMI_...);

function VMI_slope(x) {
  correlation_or_slope(x, 'slope');
}

// Add the custom operator instruction to the global lists
// NOTE: All custom operators are monadic (priority 9) and reducing
OPERATORS.push('slope');
MONADIC_OPERATORS.push('slope');
ACTUAL_SYMBOLS.push('slope');
OPERATOR_CODES.push(VMI_slope);
MONADIC_CODES.push(VMI_slope);
REDUCING_CODES.push(VMI_slope);
SYMBOL_CODES.push(VMI_slope);
PRIORITIES.push(9);
// Add to this list only if operation makes an expression dynamic
// DYNAMIC_SYMBOLS.push('...');
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
};
