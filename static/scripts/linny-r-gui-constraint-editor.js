/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-constraint-editor.js) provides the GUI
dialog for the Linny-R constraint editor.

*/

/*
Copyright (c) 2017-2024 Delft University of Technology

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

// CLASS ConstraintEditor
class ConstraintEditor {
  constructor() {
    this.dialog = document.getElementById('constraint-dlg');
    this.group_size = document.getElementById('constraint-group');
    this.from_name = document.getElementById('constraint-from-name');
    this.to_name = document.getElementById('constraint-to-name');
    this.bl_type = document.getElementById('bl-type');
    this.soc_direct = document.getElementById('constraint-soc-direct');
    this.soc = document.getElementById('constraint-share-of-cost');
    this.soc_div = document.getElementById('constraint-soc');
    // Make GUI elements responsive
    UI.modals.constraint.dialog.addEventListener('mousemove',
        () => DOCUMENTATION_MANAGER.update(
            CONSTRAINT_EDITOR.edited_constraint, true));
    UI.modals.constraint.cancel.addEventListener('click',
        () => UI.modals.constraint.hide());
    UI.modals.constraint.ok.addEventListener('click',
        () => CONSTRAINT_EDITOR.updateConstraint());
    this.container = document.getElementById('constraint-container');
    this.container.addEventListener('mousemove',
        (event) => CONSTRAINT_EDITOR.mouseMove(event));
    this.container.addEventListener('mousedown',
        () => CONSTRAINT_EDITOR.mouseDown(event));
    this.container.addEventListener('mouseup',
        () => CONSTRAINT_EDITOR.mouseUp());
    // NOTE: interpret leaving the area as a mouse-up so that dragging ceases
    this.container.addEventListener('mouseleave',
        () => CONSTRAINT_EDITOR.mouseUp());
    this.pos_x_div = document.getElementById('constraint-pos-x');
    this.pos_y_div = document.getElementById('constraint-pos-y');
    this.point_div = document.getElementById('constraint-point');
    this.equation_div = document.getElementById('constraint-equation');
    this.convex_div = document.getElementById('constraint-convex');
    this.add_point_btn = document.getElementById('add-point-btn');
    this.add_point_btn.addEventListener('click',
        () => CONSTRAINT_EDITOR.addPointToLine());
    this.del_point_btn = document.getElementById('del-point-btn');
    this.del_point_btn.addEventListener('click',
        () => CONSTRAINT_EDITOR.deletePointFromLine());
    this.add_bl_btn = document.getElementById('add-bl-btn');
    this.add_bl_btn.addEventListener('click',
        () => CONSTRAINT_EDITOR.addBoundLine());
    this.bl_type.addEventListener('change',
        () => CONSTRAINT_EDITOR.changeLineType());
    this.soc.addEventListener('blur',
        () => CONSTRAINT_EDITOR.changeShareOfCost());
    this.bl_data_btn = document.getElementById('bl-data-btn');
    this.bl_data_btn.addEventListener('click',
        () => CONSTRAINT_EDITOR.showBoundLineModal());
    this.delete_bl_btn = document.getElementById('del-bl-btn');
    this.delete_bl_btn.addEventListener('click',
        () => CONSTRAINT_EDITOR.deleteBoundLine());
    // Prepare the "precise point" dialog.
    this.point_modal = new ModalDialog('boundline-point');
    this.point_modal.ok.addEventListener(
        'click', () => CONSTRAINT_EDITOR.setPointPosition());
    this.point_modal.cancel.addEventListener(
        'click', () => CONSTRAINT_EDITOR.point_modal.hide());
    // Also prepare the boundline modal.
    this.boundline_modal = new ModalDialog('boundline-data');
    this.boundline_modal.close.addEventListener(
        'click', () => CONSTRAINT_EDITOR.updateBoundLineProperties());
    this.boundline_modal.element('edit-btn').addEventListener(
        'click', () => CONSTRAINT_EDITOR.startEditing());
    this.boundline_modal.element('save-btn').addEventListener(
        'click', () => CONSTRAINT_EDITOR.stopEditing(true));
    this.boundline_modal.element('cancel-btn').addEventListener(
        'click', () => CONSTRAINT_EDITOR.stopEditing(false));
    this.boundline_modal.element('url').addEventListener(
        'blur', () => CONSTRAINT_EDITOR.loadPointData());
    const bls = this.boundline_modal.element('series');
    bls.addEventListener('keyup', () => CONSTRAINT_EDITOR.updateLine());
    bls.addEventListener('click', () => CONSTRAINT_EDITOR.updateLine());
    // NOTE: Chart should show default line when cursor is not over data.
    this.boundline_modal.element('series-table').addEventListener(
        'mouseout', () => CONSTRAINT_EDITOR.showDefaultBoundLine());
    // Make boundline selector buttons responsive.
    this.selector_btns = 'bl-rename-sel bl-edit-sel bl-delete-sel';
    document.getElementById('bl-add-sel-btn').addEventListener(
        'click', () => CONSTRAINT_EDITOR.promptForSelector());
    document.getElementById('bl-rename-sel-btn').addEventListener(
        'click', () => CONSTRAINT_EDITOR.promptForSelector('rename'));
    document.getElementById('bl-edit-sel-btn').addEventListener(
        'click', () => CONSTRAINT_EDITOR.editExpression());
    document.getElementById('bl-delete-sel-btn').addEventListener(
        'click', () => CONSTRAINT_EDITOR.deleteSelector());
    // Prepare boundline selector modals.
    this.new_selector_modal = new ModalDialog('new-selector');
    this.new_selector_modal.ok.addEventListener(
        'click', () => CONSTRAINT_EDITOR.newSelector());
    this.new_selector_modal.cancel.addEventListener(
        'click', () => CONSTRAINT_EDITOR.new_selector_modal.hide());
    this.rename_selector_modal = new ModalDialog('rename-selector');
    this.rename_selector_modal.ok.addEventListener(
        'click', () => CONSTRAINT_EDITOR.renameSelector());
    this.rename_selector_modal.cancel.addEventListener(
        'click', () => CONSTRAINT_EDITOR.rename_selector_modal.hide());
    // The chart is stored as an SVG string.
    this.svg = '';
    // The line path and contour path SVG.
    this.line_path_svg = '';
    this.contour_path_svg = '';
    // Scale, origin X and Y assume a 300x300 px square chart area.
    this.scale = 3;
    this.oX = 25;
    this.oY = 315;
    // 0 => silver, LE => orange/red, GE => cyan/blue, EQ => purple.
    this.line_color = ['#a0a0a0', '#c04000', '#0040c0', '#9000a0'];
    // Use brighter shades if selected (darker for gray) 
    this.selected_color = ['#808080', '#ff8040', '#00b0d0', '#a800ff'];
    // The selected bound line object (NULL => no line selected)
    this.selected = null;
    // Cursor position in chart coordinates (100 x 100 grid)
    this.pos_x = 0;
    this.pos_y = 0;
    // `on_line`: the first bound line object detected under the cursor.
    this.on_line = null;
    // `on_point`: index of point under the cursor.
    this.on_point = -1;
    this.dragged_point = -1;
    this.selected_point = -1;
    this.selected_selector = false;
    this.last_time_clicked = 0;
    this.cursor = 'default';
    // Start in data viewing mode.
    this.stopEditing(false);
    // Properties for tracking which constraint is being edited.
    this.from_node = null;
    this.to_node = null;
    // The constraint (model entity) being added or modified.
    this.edited_constraint = null;
    // The constraint object that is being modified: either a new instance,
    // or a *copy* of edited_constraint so changes can be ignored on "canel".
    this.constraint = null;
    // List of constraints when multiple constraints are edited.
    this.group = [];
    // Boundline selector expression being edited.
    this.edited_expression = null;
    // NOTE: All edits will be ignored unless the modeler clicks OK.
  }
  
  get twoClicks() {
    // Return TRUE iff two mouse clicks occurred within 300 ms.
    const
        now = Date.now(),
        dt = now - this.last_time_clicked;
    this.last_time_clicked = now;
    if(dt < 300) {
      this.last_time_clicked = 0;
      return true;
    }
    return false;
  }
  
  mouseMove(e) {
    // The onMouseMove response of the constraint editor's graph area
    // Calculate cursor point without restricting it to 100x100 grid
    const
        rect = this.container.getBoundingClientRect(),
        top = rect.top + window.scrollY + document.body.scrollTop, 
        left = rect.left + window.scrollX + document.body.scrollLeft,
        x = Math.floor(e.clientX - left - this.oX) / this.scale,
        y = 100 - Math.floor(e.clientY - top - (this.oY - 100*this.scale)) / this.scale;
    // Limit X and Y so that they will always display between 0 and 100
    this.pos_x = Math.min(100, Math.max(0, x));
    this.pos_y = Math.min(100, Math.max(0, y));
    this.updateStatus();
    if(this.dragged_point >= 0) {
      this.movePoint(this.pos_x, this.pos_y);
    } else {
      this.checkLines();
    }
  }
  
  mouseDown(e) {
    // The onMouseDown response of the constraint editor's graph area.
    const two = this.twoClicks;
    if(this.adding_point) {
      this.doAddPointToLine();
    } else if(this.on_line) {
      const
          same_line = two && this.selected === this.on_line,
          same_point = two && this.selected_point === this.on_point;
      this.selectBoundLine(this.on_line);
      this.dragged_point = this.on_point;
      this.selected_point = this.on_point;
      if(this.on_point >= 0 && (e.altKey || same_point)) {
        this.positionPoint();
      } else if(this.on_line && (e.altKey || same_line)) {
        this.showBoundLineModal();
      }
    } else {
      this.selected = null;
      this.dragged_point = -1;
      this.selected_point = -1;
    }
    this.draw();
  }
  
  mouseUp() {
    // The onMouseUp response of the constraint editor's graph area.
    this.dragged_point = -1;
    this.container.style.cursor = this.cursor;
    this.updateStatus();
  }
  
  updateCursor() {
    // Updates cursor shape in accordance with current state
    if(this.dragged_point >= 0 || this.on_point >= 0) {
      this.cursor = 'move';
    } else if(this.adding_point) {
      if(this.pos_x === 0 || this.pos_x === 100) {
        this.cursor = 'not-allowed';
      } else {
        this.cursor = 'crosshair';
      }
    } else if(this.on_line) {
      this.cursor = 'pointer';
    } else {
      this.cursor = 'default';
    }
    this.container.style.cursor = this.cursor;
  }
  
  arrowKey(e) {
    // Move point by 1 grid unit (1/3 pixel), or more precisely when
    // Shift, Ctrl and/or Alt are pressed. Shift resolution is 1/10,
    // Ctrl resolution = 1/100, combined => 1/1000. Just Alt resolution
    // is 1/10000, and with Shift + Ctrl becomes 1e-7.
    if(this.selected && this.selected_point >= 0) {
      const custom = e.shiftKey || e.ctrlKey || e.altKey;
      let divisor = 3;
      if(e.shiftKey) {
        divisor = 10;
        if(e.ctrlKey) divisor = 1000;
      } else if(e.ctrlKey) {
        divisor = 100;
      }
      if(e.altKey) {
        if(divisor === 3) {
          divisor = 10000;
        } else {
          divisor *= 10000;
        }
      }
      const
          k = e.keyCode,
          i = this.selected_point,
          pts = this.selected.points,
          li = pts.length - 1,
          // NOTE: Use a copy of the selected point, or it will not be updated.
          p = pts[this.selected_point].slice(),
          minx = (i === 0 ? 0 : (i === li ? 100 : pts[i - 1][0])),
          maxx = (i === 0 ? 0 : (i === li ? 100 : pts[i + 1][0]));
      let cx = false,
          cy = false;
      if(k === 37) {
        p[0] = Math.max(minx, p[0] - 1 / divisor);
        cx = true;
      } else if (k === 38 && p[1] <= 100 - 1 / divisor) {
        p[1] += 1 / divisor;
        cy = true;
      } else if (k === 39) {
        p[0] = Math.min(maxx, p[0] + 1 / divisor);
        cx = true;
      } else if (k === 40 && p[1] >= 1 / divisor) {
        p[1] -= 1 / divisor;
        cy = true;
      }
      // NOTE: Compensate for small numerical errors
      const cp = this.customPoint(p[0], p[1]);
      if(cx) {
        if(cp & 1 && custom) {
          p[0] = Math.round(divisor * p[0]) / divisor;
        } else {
          p[0] = Math.round(3 * p[0]) / 3;
        }
      }
      if(cy) {
        if(cp & 2 && custom) {
          p[1] = Math.round(divisor * p[1]) / divisor;
        } else {
          p[1] = Math.round(3 * p[1]) / 3;
        }
      }
      this.dragged_point = this.selected_point;
      this.movePoint(p[0], p[1]);
      this.dragged_point = -1;
      this.draw();
      this.updateEquation();
    }
  }
  
  customPoint(x, y) {
    // Return 0 if `x` and `y` both are "regular" points on the pixel
    // grid. For these regular points, X and Y are multiples of 1/3,
    // so 3*X and 3*Y should both be integer (apart from numerical
    // imprecision). If only X is custom, return 1, if only Y is custom,
    // return 2, and if both are custom, return 3.
    return (Math.abs(3*x - Math.round(3*x)) > VM.NEAR_ZERO ? 1 : 0) +
        (Math.abs(3*y - Math.round(3*y)) > VM.NEAR_ZERO ? 2 : 0);
  }
  
  point(x, y) {
    // Return a string denoting the point (x, y) in SVG notation, assuming
    // that x and y are mathematical coordinates (y-axis pointing UP) and
    // scaled to the constraint editor chart area, cf. global constants.
    // defined for the constraint editor.
    return (this.oX + x * this.scale) + ',' + (this.oY - y * this.scale);
  }
  
  circleCenter(x, y) {
    // Similar to cePoint above, but prefixing the coordinates to conform
    // to SVG notation for a circle center
    return `cx="${this.oX + x * this.scale}" cy="${this.oY - y * this.scale}"`;
  }
  
  selectBoundLine(l) {
    // Selects bound line `l` and move it to end of list so it will be drawn
    // last and hence on top of all other bound lines (if any) 
    this.selected = l;
    const li = this.constraint.bound_lines.indexOf(l);
    if(li < this.constraint.bound_lines.length - 1) {
      this.constraint.bound_lines.splice(li, 1);
      this.constraint.bound_lines.push(l);
    }
  }
  
  addBoundLine() {
    // Adds a new lower bound line to the set
    this.selected = this.constraint.addBoundLine();
    this.selected_point = -1;
    this.adding_point = false;
    this.updateStatus();
    this.draw();
  }

  deleteBoundLine() {
    // Removes selected boundline from the set
    if(this.selected) {
      this.constraint.deleteBoundLine(this.selected);
      this.selected = null;
      this.adding_point = false;
      this.updateStatus();
      this.draw();
    }
  }
  
  addPointToLine() {
    // Prepares to add point on next "mouse down" event
    if(this.selected) {
      this.add_point_btn.classList.add('activ');
      this.adding_point = true;
      this.selected_point = -1;
      this.draw();
    }
  }
  
  doAddPointToLine() {
    // Actually add point to selected line.
    if(!this.selected) return;
    const
        p = [this.pos_x, this.pos_y],
        lp = this.selected.points;
    let i = 0;
    while(i < lp.length && lp[i][0] < p[0]) i++;
    lp.splice(i, 0, p);
    this.selected.storePoints();
    this.selected_point = i;
    this.dragged_point = i;
    this.draw();
    // this.dragging_point = new point index! 
    this.add_point_btn.classList.remove('activ');
    this.adding_point = false;
  }
  
  deletePointFromLine() {
    // Deletes selected point from selected line (unless first or last point)
    if(this.selected && this.selected_point > 0 &&
        this.selected_point < this.selected.points.length - 1) {
      this.selected.points.splice(this.selected_point, 1);
      this.selected.storePoints();
      this.selected_point = -1;
      this.draw();
    }
  }
    
  changeLineType() {
    // Change type of selected boundline.
    if(this.selected) {
      this.selected.type = parseInt(this.bl_type.value);
      this.draw();
    }
  }
  
  loadPointData() {
    const md = this.boundline_modal;
    let url = md.element('url').value.trim();
    if(this.selected && url) {
      FILE_MANAGER.getRemoteData(this.selected, url);
    }
  }

  startEditing() {
    const
        md = this.boundline_modal,
        edit_btn = md.element('edit-btn'),
        save_btn = md.element('save-btn'),
        cancel_btn = md.element('cancel-btn'),
        tbl = md.element('series-table'),
        txt = md.element('series');
    edit_btn.classList.add('off');
    save_btn.classList.remove('off');
    cancel_btn.classList.remove('off');
    tbl.style.display = 'none';
    txt.value = this.selected.pointDataString;
    txt.style.display = 'block';
    txt.focus();
    txt.selectionStart = 0;
    txt.selectionEnd = 0;
    md.element('line').style.display = 'block';
    this.updateLine();
    UI.disableButtons(this.selector_btns);
  }

  stopEditing(save=false) {
    if(!this.selected) return;
    const
        bl = this.selected,
        md = this.boundline_modal,
        edit_btn = md.element('edit-btn'),
        save_btn = md.element('save-btn'),
        cancel_btn = md.element('cancel-btn'),
        tbl = md.element('series-table'),
        txt = md.element('series');
    if(save) {
      bl.unpackPointDataString(txt.value);
    }
    edit_btn.classList.remove('off');
    save_btn.classList.add('off');
    cancel_btn.classList.add('off');
    txt.style.display = 'none';
    md.element('line').style.display = 'none';
    tbl.innerHTML = this.boundLineDataTable;
    tbl.style.display = 'block';
    if(this.selected_selector) {
      UI.enableButtons(this.selector_btns);
    } else {
      UI.disableButtons(this.selector_btns);
    }
  }  

  updateLine() {
    const
        md = this.boundline_modal,
        txt = md.element('series'),
        ln = md.element('line-number'),
        lc = md.element('line-count');
    ln.innerHTML = 'line ' + txt.value.substring(0, txt.selectionStart)
        .split(';').length;
    lc.innerHTML = 'of ' + txt.value.split(';').length;
  }
  
  get boundLineDataTable() {
    // Return *inner* HTML for point coordinates table.
    if(!this.selected) return ;
    const
        bl = this.selected,
        tr = '<tr class="dataset" onmouseover="CONSTRAINT_EDITOR.' +
         'showDataBoundLine(%N)"><td class="bl-odnr">%N.</td>' +
         '<td class="bl-od">%D</td></tr>',
        lines = [tr.replaceAll('%N', 0).replace('%D',
            bl.pointsDataString + '<span class="grit">(default)</span>')];
    for(let i = 0; i < bl.point_data.length; i++) {
      lines.push(tr.replaceAll('%N', i + 1)
          .replace('%D', bl.point_data[i].join(' ')));
    }
    return lines.join('');
  }
  
  get boundLineSelectorTable() {
    // Return *inner* HTML for the boundline selector table.
    if(!this.selected) return '';
    const
        bl = this.selected,
        html = [],
        onclk = ` onclick="CONSTRAINT_EDITOR.selectSelector(event, '');"`;
    for(let i = 0; i < bl.selectors.length; i++) {
      const
          sel = bl.selectors[i],
          ocr = onclk.replace("''", `'${sel.selector}'`),
          ss = (sel.selector === this.selected_selector ? ' sel-set' : '');
      html.push(`<tr id="blstr${i}" class="dataset-modif${ss}">`,
          '<td class="dataset-selector"');
      if(i === 0) {
        html.push(' style="background-color: #e0e0e0; font-style: italic" ',
            'title="Default line index will be used when no experiment is running"');
      }
      let ls = '',
          rs = '';
      if(sel.grouping) {
        ls = '<span class="blpoints">';
        rs = '</span>';
      }
      if(!sel.expression.isStatic) {
        ls += '<em>';
        rs = '</em>' + rs;
      }
      html.push(ocr.replace("');", "', false);"), '>', sel.selector,
          '</td><td class="dataset-expression"', ocr, '>',
          ls, sel.expression.text, rs, '</td></tr>');
    }
    return html.join('');
  }
  
  selectSelector(event, id, x=true) {
    // Select selector, or when double-clicked, edit its expression when
    // x = TRUE, or the name of the selector when x = FALSE.
    if(!this.selected) return;
    const edit = (event.altKey ||
        (this.twoClicks && id === this.selected_selector));
    this.selected_selector = id;
    if(edit) {
      if(x) {
        this.editExpression();
      } else {
        this.promptForSelector('rename');
      }
      return;
    }
    this.updateSelectorTable();
    UI.enableButtons(this.selector_btns);
    // Do not permit deleting the default selector. 
    if(id === '(default)') UI.disableButtons('bl-delete-sel');
  }
  
  promptForSelector(dlg) {
    let ms = '',
        md = this.new_selector_modal;
    if(dlg === 'rename') {
      if(this.selected_selector) ms = this.selected_selector;
      md = this.rename_selector_modal;
    }
    md.element('type').innerText = 'boundline selector';
    md.element('name').value = ms;
    md.show('name');
  }

  newSelector() {
    if(!this.selected) return;
    const md = this.new_selector_modal;
    // NOTE: Selector modal is also used by constraint editor.
    if(md.element('type').innerText !== 'boundline selector') return;
    const
        bl = this.selected,
        sel = md.element('name').value.trim(),
        bls = bl.addSelector(sel);
    if(bls) {
      this.selected_selector = bls.selector;
      // NOTE: Update dimensions only if boundline now has 2 or more
      // selectors.
      const sl = bl.selectorList;
      if(sl.length > 1) MODEL.expandDimension(sl);
      md.hide();
      this.updateSelectorTable();
    }
  }
  
  renameSelector() {
    if(!this.selected) return;
    const md = this.rename_selector_modal;
    // NOTE: Selector modal is also used by constraint editor.
    if(md.element('type').innerText !== 'boundline selector') return;
    const
        bl = this.selected,
        sel = MODEL.validSelector(md.element('name').value.trim()),
        bls = bl.selectorByName(this.selected_selector);
    if(bls && sel) {
      bls.selector = sel;
      bl.selectors.sort((a, b) => compareSelectors(a.selector, b.selector));
    }
    md.hide();
    this.updateSelectorTable();
  }
  
  editExpression() {
    if(!this.selected) return;
    const
        bl = this.selected,
        bls = bl.selectorByName(this.selected_selector);
    if(bls) {
      this.edited_expression = bls.expression;
      const md = UI.modals.expression;
      md.element('property').innerHTML = 'boundline selector';
      md.element('text').value = bls.expression.text;
      document.getElementById('variable-obj').value = 0;
      X_EDIT.updateVariableBar();
      X_EDIT.clearStatusBar();
      md.show('text');
    }
  }

  modifyExpression(x, grouping) {
    // Update boundline index expression.
    if(!this.selected) return;
    const
        bl = this.selected,
        bls = bl.selectorByName(this.selected_selector);
    if(!bls) return;
    const blsx = bls.expression;
    // Double-check that selector expression is indeed being edited.
    if(blsx !== this.edited_expression) {
      console.log('ERROR: boundline selector expression mismatch',
          x, bls, this.edited_expression);
      return;
    }
    bls.grouping = grouping;
    // Update and compile expression only if it has been changed.
    if(x != blsx.text) {
      blsx.text = x;
      blsx.compile();
      if(grouping && blsx.isStatic) {
        // Check whether the point coordinates are valid.
        const
            r1 = blsx.result(1),
            r2 = r1.slice();
        bls.boundline.validatePoints(r2);
        if(r1.join(';') !== r2.join(';')) {
          UI.warn('Points expression for <tt>' + bls.selector +
              '</tt> will evaluate as ' + r2.join('; '));
        }
      }
    }
    // Clear expression results, just to be neat.
    blsx.reset();
    // Clear the `selected_expression` property of the constraint editor.
    this.edited_expression = null;
    this.updateSelectorTable();
  }

  deleteSelector() {
    // Delete modifier from selected dataset.
    if(!this.selected) return;
    const
        bl = this.selected,
        bls = this.selected.selectorByName(this.selected_selector);
    if(bls && bls.selector) {
      // If it is not the default selector, simply remove it from the list.
      const i = bl.selectors.indexOf(bls);
      if(i > 0) bl.selectors.splice(i, 1);
      this.selected_selector = false;
      this.updateSelectorTable();
      MODEL.updateDimensions();
    }
  }

  updateSelectorTable() {  
    this.boundline_modal.element('sel-table')
        .innerHTML = this.boundLineSelectorTable;
  }

  showBoundLineModal() {
    // Open modal to modify data properties of selected boundline.
    if(!this.selected) return;
    // Ensure that bound line does not have a selected or dragged point.
    this.on_point = -1;
    this.dragged_point = -1;
    this.selected_point = -1;
    const
        bl = this.selected,
        md = this.boundline_modal;
    md.element('url').value = bl.url;
    this.updateSelectorTable();
    this.stopEditing();
    md.show();
  }
  
  showDefaultBoundLine() {
    // Restore and redraw default bound line.
    if(this.selected) this.selected.restorePoints();
    this.draw();    
  }
  
  updateBoundLineProperties() {
    // Change experiment run selectors of selected boundline.
    if(this.selected) {
      const
          bl = this.selected,
          md = this.boundline_modal;
      bl.url = md.element('url').value;
      this.showDefaultBoundLine();
      md.hide();
    }
  }
  
  showDataBoundLine(index) {
    // Redraw diagram with selected boundline now having its points based
    // on data for the given index.
    if(!this.selected) return;
    const bl = this.selected;
    bl.setPointsFromData(index);
    this.draw();
    bl.restorePoints();
  }
  
  changeShareOfCost() {
    // Validates input of share-of-cost field
    const soc = UI.validNumericInput('constraint-share-of-cost', 'share of cost');
    if(soc === false) return;
    if(soc < 0 || soc > 100) {
      this.soc.focus();
      UI.warn('Share of cost can range from 0% to 100%');
      return;
    }
    // NOTE: share of cost is input as a percentage, but stored as a floating
    // point value between 0 and 1
    this.constraint.share_of_cost = soc / 100;
  }
  
  checkLines() {
    // Checks whether cursor is on a bound line and updates the constraint
    // editor status accordingly.
    this.on_line = null;
    this.on_point = -1;
    this.seg_points = null;
    // Iterate over all lower bound lines (start with last one added)
    for(let i = this.constraint.bound_lines.length - 1;
        i >= 0 && !this.on_line; i--) {
      const l = this.constraint.bound_lines[i];
      for(let j = 0; j < l.points.length; j++) {
        const
            p = l.points[j],
            dsq = Math.pow(p[0] - this.pos_x, 2) + Math.pow(p[1] - this.pos_y, 2);
        if(dsq < 3) {
          this.on_point = j;
          this.on_line = l;
          this.seg_points = (j > 0 ? [j - 1, j] : [j, j + 1]);
          break;
        } else if(j > 0) {
          this.seg_points = [j - 1, j];
          const pp = l.points[j - 1];
          if(this.pos_x > pp[0] - 1 && this.pos_x < p[0] + 1 &&
              ((this.pos_y > pp[1] - 1 && this.pos_y < p[1] + 1) ||
               (this.pos_y < pp[1] + 1 && this.pos_y > p[1] + 1))) {
            // Cursor lies within rectangle around line segment
            const
                dx = p[0] - pp[0],
                dy = p[1] - pp[1];
            if(Math.abs(dx) < 1 || Math.abs(dy) < 1) {
              // Special case: (near) vertical or (near) horizontal line
              this.on_line = l;
              break;
            } else {
              const
                  dpx = this.pos_x - pp[0],
                  dpy = this.pos_y - pp[1],
                  dxol = Math.abs(pp[0] + dpy * dx / dy - this.pos_x),
                  dyol = Math.abs(pp[1] + dpx * dy / dx - this.pos_y);
              if (Math.min(dxol, dyol) < 1) {
                this.on_line = l;
                break;
              }
            }
          }
        }
      }
    }
    this.updateEquation();
    this.updateCursor();
  }
  
  updateEquation() {
    // Show the equation for the line segment under the cursor, and
    // indicate whether the bound line is concave or convex.
    var segeq = '',
        convex = '';
    if(this.on_line && this.seg_points) {
      const
          p1 = this.on_line.points[this.seg_points[0]],
          p2 = this.on_line.points[this.seg_points[1]],
          dx = p2[0] - p1[0],
          dy = p2[1] - p1[1];
      if(dx === 0) {
        segeq = 'X = ' + p1[0].toPrecision(3);
      } else if(dy === 0) {
        segeq = 'Y = ' + p1[1].toPrecision(3);
      } else {
        const
            slope = (dy === dx ? '' :
                (dy === -dx ? '-' : (dy / dx).toPrecision(3) + ' ')),
            y0 = p2[1] - p2[0] * dy / dx;
        segeq = `Y = ${slope}X` + (y0 === 0 ? '' :
            (y0 < 0 ? ' - ' : ' + ') + Math.abs(y0).toPrecision(3));
      }
    }
    if(this.on_line) {
      const c = this.on_line.needsNoSOS;
      if(c > 0) {
        convex = '\u2934'; // Curved arrow up
      } else if(c < 0) {
        convex = '\u2935'; // Curved arrow down
      }
    }
    this.equation_div.innerHTML = segeq;
    this.convex_div.innerHTML = convex;
  }
  
  positionPoint() {
    // Prompt modeler for precise point coordinates.
    if(this.selected_point < 0) return;
    // Prevent that "drag point" state persists after ESC o cancel.
    this.dragged_point = -1;
    const
        md = this.point_modal,
        pc = this.point_div.innerHTML.split(', ');
    md.element('x').value = pc[0].substring(1);
    md.element('y').value = pc[1].substring(0, pc[1].length - 1);
    md.show('x');
  }
  
  validPointCoordinate(c) {
    // Return floating point for coordinate `c` (= 'x' or 'y') or FALSE
    // if input is invalid.
    const
        md = this.point_modal,
        e = md.element(c),
        v = safeStrToFloat(e.value, false);
    if(v === false || v < 0 || v > 100) {
      UI.warn('Invalid boundline point coordinate');
      e.select();
      e.focus();
      return false;
    }
    return v;
  }

  setPointPosition() {
    // Check coordinates, and if valid update those of the selected point.
    // Otherwise, warn user and select offending input field.
    if(this.selected_point < 0) return;
    const
        x = this.validPointCoordinate('x'),
        y = this.validPointCoordinate('y');
    if(x !== false && y !== false) {
      this.dragged_point = this.selected_point;
      this.movePoint(x, y);
      this.dragged_point = -1;
      this.point_modal.hide();
    }
  }

  movePoint(x, y) {
    // Move the dragged point of the selected bound line.
    // Use `l` as shorthand for the selected line.
    const
        l = this.selected,
        pi = this.dragged_point,
        lpi = l.points.length - 1;
    // Check -- just in case.
    if(!l || pi < 0 || pi > lpi) return;
    let p = l.points[pi],
        px = p[0],
        py = p[1],
        minx = (pi === 0 ? 0 : (pi === lpi ? 100 : l.points[pi - 1][0])),
        maxx = (pi === 0 ? 0 : (pi === lpi ? 100 : l.points[pi + 1][0])),
        newx = Math.min(maxx, Math.max(minx, x)),
        newy = Math.min(100, Math.max(0, y));
    // No action needed unless point has been moved.
    if(newx !== px || newy !== py) {
      p[0] = newx;
      p[1] = newy;
      l.storePoints();
      this.draw();
      this.updateEquation();
    }
  }

  updateStatus() {    
    // Display cursor position as X and Y (in chart coordinates), and
    // update controls.
    this.pos_x_div.innerHTML = 'X = ' + this.pos_x.toPrecision(3);
    this.pos_y_div.innerHTML = 'Y = ' + this.pos_y.toPrecision(3);
    this.point_div.innerHTML = '';
    const blbtns = 'add-point bl-data del-bl';
    if(this.selected) {
      if(this.selected_point >= 0) {
        const p = this.selected.points[this.selected_point];
        let px = p[0].toPrecision(3),
            py = p[1].toPrecision(3),
            cp = this.customPoint(p[0], p[1]);
        if(cp & 1) px = p[0].toPrecision(10).replace(/[0]+$/, '')
            .replace(/\.$/, '');
        if(cp & 2) py = p[1].toPrecision(10).replace(/[0]+$/, '')
            .replace(/\.$/, '');
        this.point_div.innerHTML = `(${px}, ${py})`;
      }
      // Check whether selected point is an end point.
      const ep = this.selected_point === 0 ||
          this.selected_point === this.selected.points.length - 1;
      // If so, do not allow deletion.
      UI.enableButtons(blbtns + (ep ? '' : ' del-point'));
      if(this.adding_point) this.add_point_btn.classList.add('activ');
      this.bl_type.value = this.selected.type;
      this.bl_type.style.color = 'black';
      this.bl_type.disabled = false;
    } else {
      UI.disableButtons(blbtns + ' del-point');
      this.bl_type.value = VM.EQ;
      this.bl_type.style.color = 'silver';
      this.bl_type.disabled = true;
    }
  }

  addSVG(lines) {
    // Appends a string or an array of strings to the SVG
    this.svg += (lines instanceof Array ? lines.join('') : lines);
  }
  
  draw() {
    // Draws the chart with bound lines and infeasible regions
    // NOTE: since this graph is relatively small, SVG is added as an XML string
    this.svg = ['<svg height="330" version="1.1" width="340"',
      ' xmlns="http://www.w3.org/2000/svg"',
      ' xmlns:xlink="http://www.w3.org/1999/xlink"',
      ' style="overflow: hidden; position: relative;">',
      '<defs>',
      // Fill patterns for infeasible areas differ per bound line type;
      // diagonal for LE and GE, horizontal for EQ, and when selected
      // in the constraint editor, different colors as well (orange,
      // blue or purple)
      '<pattern id="stroke1" x="2" y="2" width="4" height="4"',
      ' patternUnits="userSpaceOnUse"><path d="M0,0L4,4"',
      ' style="stroke: #400000; stroke-width: 0.5"></pattern>',
      '<pattern id="stroke1s" x="2" y="2" width="4" height="4"',
      ' patternUnits="userSpaceOnUse"><path d="M0,0L4,4"',
      ' style="stroke: #f04000; stroke-width: 0.5"></pattern>',
      '<pattern id="stroke2" x="2" y="2" width="4" height="4"',
      ' patternUnits="userSpaceOnUse"><path d="M4,0L0,4"',
      ' style="stroke: #000040; stroke-width: 0.5"></pattern>',
      '<pattern id="stroke2s" x="2" y="2" width="4" height="4"',
      ' patternUnits="userSpaceOnUse"><path d="M4,0L0,4"',
      ' style="stroke: #00a0ff; stroke-width: 0.5"></pattern>',
      '<pattern id="stroke3" x="2" y="2" width="4" height="4"',
      ' patternUnits="userSpaceOnUse"><path d="M0,2L4,2"',
      ' style="stroke: #180030; stroke-width: 0.5"></pattern>',
      '<pattern id="stroke3s" x="2" y="2" width="4" height="4"',
      ' patternUnits="userSpaceOnUse"><path d="M0,2L4,2"',
      ' style="stroke: #c060ff; stroke-width: 0.5"></pattern>',
      '</defs>'].join('');
    // Draw the grid
    this.drawGrid();
    // Use `c` as shorthand for this.constraint.
    const c = this.constraint;
    // Add the SVG for lower and upper bounds
    for(const bl of c.bound_lines) {
      this.drawContour(bl);
      this.drawLine(bl);
    }
    this.highlightSelectedPoint();
    // Add the SVG disclaimer
    this.addSVG('Sorry, your browser does not support inline SVG.</svg>');
    // Insert the SVG into the designated DIV
    this.container.innerHTML = this.svg;
    this.updateStatus();
  }

  drawGrid() {
    // Draw the grid area
    const hw = 100 * this.scale;
    this.addSVG(['<rect x="', this.oX, '" y="', this.oY - hw,
      '" width="', hw, '" height="', hw,
      '" fill="white" stroke="gray" stroke-width="1.5"></rect>']);
    // NOTES:
    // (1) font name fixed to Arial on purpose to preserve the look of
    //     this dialog
    // (2) d = distance between grid lines, l = left, r = right, t = top,
    //     b = bottom, tx = end of right-aligned numbers along vertical axis,
    //     ty = middle for numbers along the horizontal axis
    const d = 10 * this.scale, l = this.oX + 1, r = this.oX + hw - 1,
          t = this.oY - hw + 1, b = this.oY - 1,
          tx = this.oX - 3, ty = this.oY + 12;
    // Draw the dashed grid lines and their numbers 10 - 90 along both axes
    for(let i = 1; i < 10; i++) {
      const x = i*d + this.oX, y = this.oY - i*d, n = 10*i;
      this.addSVG(['<path fill="none" stroke="silver" d="M',
        x, ',', t, 'L', x, ',', b,
        '" stroke-width="0.5" stroke-dasharray="5,2.5"></path>',
        '<path fill="none" stroke="silver" d="M', l, ',', y, 'L', r, ',', y,
        '" stroke-width="0.5" stroke-dasharray="5,2.5"></path>',
        '<text x="', x, '" y="', ty,
        '" text-anchor="middle" font-family="Arial"',
        ' font-size="10px" stroke="none" fill="black">', n, '</text>',
        '<text x="', tx, '" y="', y + 4,
        '" text-anchor="end" font-family="Arial"',
        ' font-size="10px" stroke="none" fill="black">', n, '</text>']);
    }
    // also draw scale extremes (0 and 2x 100)
    this.addSVG(['<text x="', tx, '" y="', ty, '" text-anchor="end"',
      ' font-family="Arial" font-size="10px" stroke="none" fill="black">',
      '0</text><text x="', r,'" y="', ty, '" text-anchor="middle"',
      ' font-family="Arial" font-size="10px" stroke="none" fill="black">',
      '100</text><text x="', tx, '" y="', t, '" text-anchor="end"',
      ' font-family="Arial" font-size="10px" stroke="none" fill="black">',
      '100</text>']);
  }
  
  setContourPath(l) {
    // Computes the contour path (which is the line path for EQ bounds)
    // without drawing them in the chart -- used when drawing thumbnails.
    this.drawContour(l, false);
    this.drawLine(l, false);
  }

  drawContour(l, display=true) {
    // Draws infeasible area for bound line `l`.
    let cp;
    if(l.type === VM.EQ) {
      // Whole area is infeasible except for the bound line itself.
      cp = ['M', this.point(0, 0), 'L', this.point(100 ,0), 'L',
          this.point(100, 100), 'L', this.point(0, 100), 'z'].join('');
    } else {
      const base_y = (l.type === VM.GE ? 0 : 100);
      cp = 'M' + this.point(0, base_y);
      for(const p of l.points) cp += `L${this.point(p[0], p[1])}`;
      cp += 'L' + this.point(100, base_y) + 'z';
      // Save the contour for rapid display of thumbnails.
      l.contour_path = cp;
    }
    if(!display) return;
    // NOTE: the selected bound lines have their infeasible area filled
    // with a *colored* line pattern
    const sel = l === this.selected;
    this.addSVG(['<path fill="url(#stroke', l.type,
        (sel ? 's' : ''), ')" d="', cp, '" stroke="none" opacity="',
        (sel ? 1 : 0.4), '"></path>']);
  }
  
  drawLine(l, display=true) {
    let color,
        width,
        pp = [],
        dots = '';
    if(l == this.selected) {
      width = 3;
      color = this.selected_color[l.type];
    } else {
      width = 1.5;
      color = this.line_color[l.type];
    }
    const
        cfs = `fill="${color}" stroke="${color}" stroke-width="${width}"`,
        icfs = 'fill="white" stroke="white" stroke-width="1"';
    for(const p of l.points) {
      const
          px = p[0],
          py = p[1];
      pp.push(this.point(px, py));
      dots += `<circle ${this.circleCenter(px, py)} r="3" ${cfs}></circle>`;
      // Draw "custom points" with a white inner circle.
      if(this.customPoint(px, py)) {
        dots += `<circle ${this.circleCenter(px, py)} r="1.5" ${icfs}></circle>`;      
      }
    }
    const cp = 'M' + pp.join('L');
    // For EQ bound lines, the line path is the contour; this will be
    // drawn in miniature black against a silver background
    if(l.type === VM.EQ) l.contour_path = cp;
    if(!display) return;
    this.addSVG(['<path fill="none" stroke="', color, '" d="', cp,
      '" stroke-width="', width, '"></path>', dots]);
  }

  highlightSelectedPoint() {
    if(this.selected && this.selected_point >= 0) {
      const p = this.selected.points[this.selected_point];
      this.addSVG(['<circle ', this.circleCenter(p[0], p[1]),
          ' r="4.5" fill="none" stroke="black" stroke-width="2px"></circle>']);
    }
  }
  
  showDialog(group=[]) {
    this.from_node = MODEL.objectByName(this.from_name.innerText);
    this.to_node = MODEL.objectByName(this.to_name.innerText);
    // Double-check that these nodes exist.
    if(!(this.from_node && this.to_node)) {
      throw 'ERROR: Unknown constraint node(s)';
    }
    // See if existing constraint is edited.
    this.edited_constraint = this.from_node.doesConstrain(this.to_node);
    if(this.edited_constraint) {
      // Make a working copy, as the constraint must be changed only when
      // dialog OK is clicked. NOTE: use the GET property "copy", NOT the
      // Javascript function copy() !! 
      this.constraint = this.edited_constraint.copy;
      this.group = group;
      this.group_size.innerText = (group.length > 0 ?
        `(N=${md.group.length})`: '');
    } else {
      // Create a new constraint
      this.constraint = new Constraint(this.from_node, this.to_node);
    }
    this.selected = null;
    // Draw the graph
    this.draw();
    // Allow modeler to omit slack variables for this constraint
    // NOTE: this could be expanded to apply to the selected BL only
    UI.setBox('constraint-no-slack', this.constraint.no_slack);
    // NOTE: share of cost can only be transferred between two processes
    // @@TO DO: CHECK WHETHER THIS LIMITATION IS VALID -- for now, allow both
    if(true||this.from_node instanceof Process && this.from_node instanceof Process) {
      this.soc_direct.value = this.constraint.soc_direction;
      // NOTE: share of cost is input as a percentage
      this.soc.value = VM.sig4Dig(100 * this.constraint.share_of_cost);
      this.soc_div.style.display = 'block';
    } else {
      this.soc_direct.value = VM.SOC_X_Y;
      this.soc.value = '0';
      this.soc_div.style.display = 'none';
    }
    UI.modals.constraint.show('soc-direct');
  }

  updateConstraint() {
    // Update the edited constraint, or add a new constraint to the model.
    // TO DO: prepare for undo
    if(this.edited_constraint === null) {
      this.edited_constraint = MODEL.addConstraint(this.from_node, this.to_node);
    }
    // Copy properties of the "working copy" to the edited/new constraint
    // except for the comments (as these cannot be added/modified while the
    // constraint editor is visible)
    const cmnts = this.edited_constraint.comments;
    this.edited_constraint.copyPropertiesFrom(this.constraint);
    this.edited_constraint.comments = cmnts;
    // Set the "no slack" property based on the checkbox state
    this.edited_constraint.no_slack = UI.boxChecked('constraint-no-slack');
    // Set the SoC direction property based on the selected option
    this.edited_constraint.soc_direction = parseInt(this.soc_direct.value);
    UI.paper.drawConstraint(this.edited_constraint);
    UI.modals.constraint.hide();
  }

} // END of class ConstraintEditor

