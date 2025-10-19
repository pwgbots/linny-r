/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-actor-manager.js) provides the GUI
functionality for the Linny-R Actor Manager dialog.

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

// CLASS ActorManager (modal dialog!)
class ActorManager {
  constructor() {
    // Make the Actors modal buttons responsive
    UI.modals.actors.ok.addEventListener(
        'click', () => ACTOR_MANAGER.updateActorProperties());
    UI.modals.actors.cancel.addEventListener(
        'click', () => UI.modals.actors.hide());
    this.dialog = document.getElementById('actors-dlg');
    this.round_count = document.getElementById('round-count');
    this.add_btn = document.getElementById('add-round-btn');
    this.add_btn.addEventListener(
        'click', () => ACTOR_MANAGER.addRound());
    this.delete_btn = document.getElementById('delete-round-btn');
    this.delete_btn.addEventListener(
        'click', () => ACTOR_MANAGER.deleteSelectedRound());
    this.sequence = document.getElementById('default-sequence');
    this.scroll_area = document.getElementById('actors-scroll');
    this.header = document.getElementById('rounds-hdr');
    this.table = document.getElementById('actors-table');
    // Modal related to this dialog
    this.actor_modal = new ModalDialog('actor');
    this.actor_modal.ok.addEventListener(
        'click', () => ACTOR_MANAGER.modifyActorEntry());
    this.actor_modal.cancel.addEventListener(
        'click', () => ACTOR_MANAGER.actor_modal.hide());
    this.actor_name = document.getElementById('actor-name');
    this.actor_span = document.getElementById('actor-span');
    this.actor_io = document.getElementById('actor-io');
    this.actor_io.addEventListener(
        'click', () => UI.toggleImportExportBox('actor'));
    this.actor_weight = document.getElementById('actor-W');
    document.getElementById('actor-W-x').addEventListener(
        'click', (event) => X_EDIT.editExpression(event));
    // Initialize properties
    this.rounds = 1;
    this.selected_round = 0;
  }
  
  roundLetter(n) {
    // Return integer `n` as lower case letter: 1 = a, 2 = b, 26 = z.
    // NOTE: Numbers 27-31 return upper case A-E; beyond ranges results in '?'.
    if(n < 1 || n > VM.max_rounds) return '?';
    return VM.round_letters[n];
  }
  
  checkRoundSequence(s) {
    // Expects a string with zero or more round letters
    for(const rl of s) {
      const n = VM.round_letters.indexOf(rl);
      if(n < 1 || n > this.rounds) {
        UI.warn(`Round ${rl} outside range (a` +
            (this.rounds > 1 ? '-' + this.roundLetter(this.rounds) : '') + ')');
        return false;    
      }
    }
    return s;
  }

  showDialog(reset=true) {
    // Display the "actor list view" modal
    let html = '';
    // Create a sorted actor list with items [id, name, flags, weight, iotype]
    // where flags is interpreted bitwise (bit N = 1 => checked for round N)
    if(reset) {
      // If reset, infer actor list and number of rounds from model
      MODEL.cleanUpActors();
      this.rounds = MODEL.rounds;
      this.selected_round = 0;
    }
    this.round_count.innerHTML = pluralS(this.rounds, 'round');
    if(this.rounds < VM.max_rounds) {
      this.add_btn.classList.remove('v-disab');
    } else {
      this.add_btn.classList.add('v-disab');
    }
    if(this.rounds > 1) {
      this.delete_btn.classList.remove('v-disab');
    } else {
      this.delete_btn.classList.add('v-disab');
    }
    this.sequence.placeholder =
        VM.round_letters.slice(1, this.rounds + 1) + ' (default)';
    this.sequence.value = MODEL.round_sequence;
    const
        ioc = ['', ' import', ' export'],
        rows = MODEL.actor_list.length,
        vrows = Math.min(10, rows),
        scroll = (rows > vrows);
    for(let ai = 0; ai < rows; ai++) {
      const
          a = MODEL.actor_list[ai],
          bits = a[2],
          rf = [];
      // NOTE: `bits` encodes for max. 31 rounds whether round `r` is checked.
      let b = 1;
      for(let r = 1; r <= this.rounds; r++) {
        rf.push('<div id="a-box-', ai, '-', r, '" class="abox ',
            ((bits & b) != 0 ? 'checked' : 'clear'), '"></div>');
        b *= 2;
      }
      if(scroll) rf.push('<div style="width: 14px"></div>');
      html += ['<tr class="actor" onmouseover="ACTOR_MANAGER.showActorInfo(',
          ai, ', event.shiftKey);"><td id="a-name-', ai,
          '" class="a-name', ioc[a[4]], '">', a[1],
          '</td><td id="a-weight-', ai, '" class="a-weight">', a[3],
          '</td><td class="a-boxlist">', rf.join(''), '</td></tr>'].join('');
    }
    // NOTE: Permit max. 9 rows in dialog.
    // When more than 9 rows, add space for scroll bar.
    this.dialog.style.width = (342 + (scroll ? 14 : 0) + 22 * this.rounds) + 'px';
    this.scroll_area.style.height = (24 + 23 * vrows) + 'px';
    this.scroll_area.style.overflowY = (scroll ? 'scroll' : 'clip');
    // Update column headers.
    const rch = [];
    for(let r = 1; r <= this.rounds; r++) {
      rch.push('<div id="round-', r, '" class="round-nr',
          (r == this.selected_round ? ' sel' : ''),
          '" onclick="ACTOR_MANAGER.toggleRound(', r, ', event.ctrlKey);">',
          this.roundLetter(r), '</div>');
    }
    this.header.innerHTML = rch.join('');
    this.table.innerHTML = html;
    // Bind click event to newly created checkboxes
    const
        abs = this.table.getElementsByClassName('abox'),
        abns = this.table.getElementsByClassName('a-name'),
        abws = this.table.getElementsByClassName('a-weight'),
        abf = (event) => UI.toggleBox(event),
        eaf = (event) => {
            // NOTE: The user has clicked on either cell 1 or cell 2 of a row
            // in the actors table, but both need to be passed on.
            const p = event.target.parentElement;
            // Pass name and weight of the selected actor (first and second
            // TD of this TR).
            ACTOR_MANAGER.showEditActorDialog(
                p.cells[0].innerText, p.cells[1].innerText);
          };
    for(const ab of abs) ab.addEventListener('click', abf);
    // Clicking the other cells should open the ACTOR dialog.
    for(const abn of abns) abn.addEventListener('click', eaf);
    for(const abw of abws) abw.addEventListener('click', eaf);
    UI.modals.actors.show();
  }

  updateRoundFlags() {
    for(let i = 0; i < MODEL.actor_list.length; i++) {
      let rf = 0, b = 1;
      for(let r = 1; r <= this.rounds; r++) {
        const abox = document.getElementById(`a-box-${i}-${r}`);
        if(abox.classList.contains('checked')) rf += b;
        b *= 2;
      }
      MODEL.actor_list[i][2] = rf;
    }
  }

  addRound() {
    // Limit # rounds to 31 to cope with 32 bit integer used by JavaScript.
    if(this.rounds < VM.max_rounds) {
      this.rounds++;
      this.round_count.innerHTML = pluralS(this.rounds, 'round');
      this.showDialog(false);
    }
  }
  
  deleteSelectedRound() {
    if(this.selected_round > 0 && this.selected_round <= this.rounds) {
      const mask = Math.pow(2, this.selected_round) - 1;
      this.updateRoundFlags();
      for(const a of MODEL.actor_list) {
        let rf = a[2];
        const
            low = (rf & mask),
            high = (rf & ~mask) >>> 1;
        a[2] = (low | high);
      }
      this.rounds--;
      this.selected_round = 0;
      this.showDialog(false);
    }
  }
  
  toggleRound(r, ctrl) {
    if(ctrl) {
      const check = !UI.boxChecked(`a-box-0-${r}`);
      for(let i = 0; i < MODEL.actor_list.length; i++) {
        UI.setBox(`a-box-${i}-${r}`, check);
      }
    } else {
      const el = document.getElementById('round-' + this.selected_round);
      if(el) el.classList.remove('sel');
      this.selected_round = r;
      document.getElementById('round-' + r).classList.add('sel');      
    }
  }
  
  showEditActorDialog(name, expr) {
    // Display modal for editing properties of one actor.
    this.actor_span.innerHTML = name;
    this.actor_name.value = name;
    // Do not allow modification of the name '(no actor)'.
    if(name === UI.NO_ACTOR) {
      this.actor_name.disabled = true;
      this.actor_io.style.display = 'none';
    } else {
      this.actor_name.disabled = false;
      UI.setImportExportBox('actor', MODEL.ioType(MODEL.objectByName(name)));
      this.actor_io.style.display = 'block';
    }
    this.actor_weight.value = expr;
    this.actor_modal.show();
  }
  
  modifyActorEntry() {
    // This method is called when the modeler submits the "actor properties"
    // dialog.
    let n = this.actor_span.innerHTML,
        nn = UI.NO_ACTOR,
        x = this.actor_weight.value.trim(),
        xp = new ExpressionParser(x);
    if(n !== UI.NO_ACTOR) {
      nn = this.actor_name.value.trim();
      // NOTE: Prohibit colons in actor names to avoid confusion with
      // prefixed entities.
      if(!UI.validName(nn) || nn.indexOf(':') >= 0) {
        UI.warn(UI.WARNING.INVALID_ACTOR_NAME);
        return false;
      }
    }
    if(xp.error) {
      // NOTE: Do not pass the actor, as its name is being edited as well.
      UI.warningInvalidWeightExpression(null, xp.error);
      return false;
    }
    for(let i = 0; i < MODEL.actor_list.length; i++) {
      const a = MODEL.actor_list[i];
      if(a[1] == n) {
        // Always update the actors' `weight` and `import/export` properties...
        a[3] = x;
        a[4] = UI.getImportExportBox('actor');
        // .. but the `name` property NOT for "(no actor)"
        if(i !== 0) a[1] = nn;
        document.getElementById('a-weight-' + i).innerHTML = x;
        const td = document.getElementById('a-name-' + i);
        td.innerHTML = nn;
        td.classList.remove('import', 'export');
        if(a[4] === 1) {
          td.classList.add('import');
        } else if(a[4] === 2) {
          td.classList.add('export');
        }
        break;
      }
    }
    this.actor_modal.hide();
  }

  updateActorProperties() {
    // This method is called when the modeler clicks OK on the actor list dialog.
    this.updateRoundFlags();
    const
        xp = new ExpressionParser(''),
        renamed_actors = [];
    let ok = true;
    const seq = this.sequence.value;
    if(this.checkRoundSequence(seq) === false) {
      document.getElementById('default-sequence').focus();
      return;
    }
    MODEL.round_sequence = seq;
    MODEL.rounds = this.rounds;
    for(const ali of MODEL.actor_list) {
      const a = MODEL.actors[ali[0]];
      // Rename actor if name has been changed.
      if(a.displayName != ali[1]) {
        a.rename(ali[1]);
        renamed_actors.push(a);
      }
      // Set its round flags
      a.round_flags = ali[2];
      // Double-check: parse expression if weight has been changed.
      const awx = monoSpacedVariables(ali[3]);
      if(a.weight.text != awx) {
        xp.expr = awx;
        xp.compile();
        if(xp.error) {
          UI.warningInvalidWeightExpression(a, xp.error);
          ok = false;
        } else {
          a.weight.update(xp);
        }
      }
      // Update import/export status.
      MODEL.ioUpdate(a, ali[4]);
    }
    if(ok) {
      const el = MODEL.entitiesByActor(renamed_actors);
      if(el.length) {
        for(const e of el) e.resize();
        UI.drawDiagram(MODEL);
      }
      UI.modals.actors.hide();
    }
  }
  
  showActorInfo(n, shift) {
    // Show actor documentation when Shift is held down.
    // NOTE: do not allow documentation of "(no actor)".
    if(n > 0) {
      const a = MODEL.actorByID(MODEL.actor_list[n][0]);
      DOCUMENTATION_MANAGER.update(a, shift);
    }
  }
  
} // END of class ActorManager
