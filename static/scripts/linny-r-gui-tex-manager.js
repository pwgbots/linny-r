/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-docu.js) provides the GUI functionality
for the Linny-R model documentation manager: the draggable dialog that allows
viewing and editing documentation text for model entities.

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

// CLASS TEXManager
class TEXManager {
  constructor() {
    this.dialog = UI.draggableDialog('tex');
    UI.resizableDialog('tex', 'TEX_MANAGER');
    this.close_btn = document.getElementById('tex-close-btn');
    this.entity_div = document.getElementById('tex-entity');
    this.formula_pane = document.getElementById('tex-formula');
    this.formula_tab = document.getElementById('tex-formula-tab');
    this.code_pane = document.getElementById('tex-code');
    this.code_tab = document.getElementById('tex-code-tab');
    // Add listeners to controls.
    this.close_btn.addEventListener(
        'click', (event) => UI.toggleDialog(event));
    this.formula_tab.addEventListener(
        'click', () => TEX_MANAGER.showFormula());
    this.code_tab.addEventListener(
        'click', () => TEX_MANAGER.showCode());
    // Initialize properties
    this.reset();   
  }

  reset() {
    this.entity = null;
    this.visible = false;
    this.editing = false;
    // KaTeX is loaded dynamically from remote site. If that fails,
    // disable the button and hide it completely.
    const btn = document.getElementById('tex-btn');
    if(typeof window.katex === 'undefined') {
      console.log('KaTeX not loaded - possibly not connected to internet');
      btn.classList.remove('enab');
      btn.classList.add('disab');
      btn.style.display = 'none';
    } else {
      btn.classList.remove('disab');
      btn.classList.add('enab');
    }
    this.showFormula();
  }

  updateDialog() {
    // Resizing dialog may require re-rendering.
  }

  update(e) {
    // Display name of entity under cursor on the infoline, and details
    // in the documentation dialog.
    if(!e || typeof window.katex === 'undefined') return;
    let et = e.type,
        edn = e.displayName;
    if(et === 'Product' || et === 'Process') {
      this.entity_div.innerHTML = `<em>${et}:</em> ${edn}`;
      this.code_pane.value = e.TEXcode;
      katex.render(this.code_pane.value, this.formula_pane,
          { throwOnError: false });
    }
  }
  
  showFormula() {
    this.code_pane.style.display = 'none';
    this.code_tab.classList.remove('sel-tab');
    this.formula_pane.style.display = 'block';
    this.formula_tab.classList.add('sel-tab');
  }
  
  showCode() {
    this.formula_pane.style.display = 'none';
    this.formula_tab.classList.remove('sel-tab');
    this.code_pane.style.display = 'block';
    this.code_tab.classList.add('sel-tab');
  }
  

} // END of class TEXManager 
