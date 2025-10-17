/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-undo.js) provides the GUI undo/redo
functionality for the Linny-R model editor.

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

// CLASS UndoEdit
class UndoEdit {
  constructor(action) {
    this.action = action;
    // NOTE: store present focal cluster, as modeler may move to other clusters
    // after an edit 
    this.cluster = MODEL.focal_cluster;
    this.object_id = null;
    // NOTE: the properties stored for an edit may differ, depending on the action
    this.properties = [];
    // Undo may involve restoring the `selected` property of selected items
    this.selection = [];
    this.xml = '';
  }
  
  get fullAction() {
    // Returns a string that reflects this edit action
    // If the identifier is set, return the action followed by the class name
    // of the object. NOTE: `obj` should then not be NULL, but check anyway
    if(this.action === 'drop' || this.action == 'lift') {
      return `Move ${pluralS(this.properties.length, 'node')} to cluster ` +
          MODEL.objectByID(this.object_id).displayName;
    } else if(this.action === 'replace') {
      return `Replace ${this.properties.g ? '' : '(locally) '}product \u2018` +
          this.properties.p + '\u2019 by product \u2018' +
          this.properties.r + '\u2019';
    } else if(this.object_id) {
      const
          obj = MODEL.objectByID(this.object_id),
          obt = (obj ? obj.type.toLowerCase() : 'UNKOWN ' + this.object_id);
      return this.action + ' ' + obt;
    // A REDO of "add" has as properties [class name, identifier] of the added object  
    } else if(this.action === 'add' && this.properties.length === 2) {
      return 'add ' + this.properties[0].toLowerCase();
    }
    // By default, return the action without further specification
    return this.action;
  }

  setSelection() {
    // Compile the list of IDs of selected entities.
    this.selection.length = 0;
    for(const obj of MODEL.selection) this.selection.push(obj.identifier);
  }
  
  get getSelection() {
    // Return the list of entities that were selected at the time of the action.
    const ol = [];
    for(const id of this.selection) {
      const obj = MODEL.objectByID(id);
      // Guard against pushing NULL pointers in case object is not found.
      if(obj) ol.push(obj);
    }
    return ol;
  }
} // END of class UndoEdit


// CLASS UndoStack
// NOTE: This object actually comprises TWO stacks -- one with undoable actions
// and one with redoable actions.
class UndoStack {
  constructor() {
    this.undoables = [];
    this.redoables = [];
    this.clear();
  }
  
  clear() {
    this.undoables.length = 0;
    this.redoables.length = 0;
    // NOTE: Set last change time to that of the model to prevent
    // that modeler is warned that unsaved changes will be discarded.
    this.last_change = (MODEL ? MODEL.last_modified : Date.now());
    this.prev_change = this.last_change;
  }
  
  recordChange() {
    // Advance time of last change.
    this.prev_change = this.last_change;
    this.last_change = new Date();
  }
  
  ignoreLastChange() {
    // Roll back time of last change.
    this.last_change = this.prev_change;
  }
  
  get topUndo() {
    // Return the short name of the top undoable action (if any).
    const n = this.undoables.length;
    if(n > 0) return this.undoables[n - 1].action;
    return false;    
  }

  get canUndo() {
    // Return the "display name" of the top undoable action (if any).
    const n = this.undoables.length;
    if(n > 0) return `Undo "${this.undoables[n - 1].fullAction}"`;
    return false;
  }
  
  get topRedo() {
    // Return the short name of the top undoable action (if any).
    const n = this.redoables.length;
    if(n > 0) return this.redoables[n - 1].action;
    return false;    
  }

  get canRedo() {
    // Return the "display name" of the top redoable action (if any).
    const n = this.redoables.length;
    if(n > 0) return `Redo "${this.redoables[n - 1].fullAction}"`;
    return false;
  }
  
  addXML(xml) {
    // Insert xml at the start (!) of any XML added previously to the UndoEdit
    // at the top of the UNDO stack.
    const i = this.undoables.length;
    if(i === 0) return false;
    this.undoables[i-1].xml = xml + this.undoables[i-1].xml;
  }

  addOffset(dx, dy) {
    // Add (dx, dy) to the offset of the "move" UndoEdit that should be at the
    // top of the UNDO stack.
    let i = this.undoables.length;
    if(i === 0) return false;
    this.undoables[i-1].properties[3] += dx;
    this.undoables[i-1].properties[4] += dy;
  }

  push(action, args=null, tentative=false) {
    // Add an UndoEdit to the undo stack, labeled with edit action that is
    // about to be performed.
    // NOTE: The IDs of objects are stored, rather than the objects themselves,
    // because deleted objects will have different memory addresses when
    // restored by an UNDO.
    this.recordChange();
    // Any action except "move" is likely to invalidate the solver result.
    if(action !== 'move' && !(
      // Exceptions:
      // (1) adding/modifying notes
      (args instanceof Note)
        )) VM.reset();

    // If this edit is new (i.e., not a redo) then remove all "redoable" edits.
    if(!tentative) this.redoables.length = 0;
    // If the undo stack is full, then discard its bottom edit.
    if(this.undoables.length == CONFIGURATION.undo_stack_size) this.undoables.splice(0, 1);
    const ue = new UndoEdit(action);
    // For specific actions, store the IDs of the selected entities.
    if(['move', 'delete', 'drop', 'lift'].indexOf(action) >= 0) {
      ue.setSelection();
    }
    // Set the properties of this undoable, depending on the type of action.
    if(action === 'move') {
      // `args` holds the dragged node => store its ID and position.
      // NOTE: For products, use their ProductPosition in the focal cluster.
      const obj = (args instanceof Product ?
          args.positionInFocalCluster : args);
      ue.properties = [args.identifier, obj.x, obj.y, 0, 0];
      // NOTE: object_id is NOT set, as dragged selection may contain
      // multiple entities.
    } else if(action === 'add') {
      // `args` holds the added entity => store its ID.
      ue.object_id = args.identifier;
    } else if(action === 'drop' || action === 'lift') {
      // Store ID of target cluster.
      ue.object_id = args.identifier;
      ue.properties = MODEL.getSelectionPositions;
    } else if(action === 'replace') {
      // Replace passes its undo information as an object.
      ue.properties = args;
    }

    // NOTE: For a DELETE action, no properties are stored; the XML needed to
    // restore deleted entities will be added by the respective delete methods.

    // Push the new edit onto the UNDO stack.
    this.undoables.push(ue);
    // Update the GUI buttons
    UI.updateButtons();
    // NOTE: Update the Finder only if needed, and with a timeout because
    // the "prepare for undo" is performed before the actual change.
    if(action !== 'move') setTimeout(() => { FINDER.updateDialog(); }, 5);
  }

  pop(action='') {
    // Remove the top edit (if any) from the stack if it has the specified action.
    // NOTE: `pop` does NOT undo the action (the model is not modified).
    let i = this.undoables.length - 1;
    if(i >= 0 && (action === '' || this.undoables[i].action === action)) {
      this.undoables.pop();
      UI.updateButtons();
    }
  }

  doMove(ue) {
    // This method implements shared code for UNDO and REDO of "move" actions.
    // First get the dragged node.
    let obj = MODEL.objectByID(ue.properties[0]); 
    if(obj) {
      // For products, use the x and y of the ProductPosition.
      if(obj instanceof Product) obj = obj.positionInFocalCluster;
      // Calculate the relative move (dx, dy).
      const
          dx = ue.properties[1] - obj.x,
          dy = ue.properties[2] - obj.y,
          tdx = -ue.properties[3],
          tdy = -ue.properties[4];
      // Update the undo edit's x and y properties so that it can be pushed onto
      // the other stack (as the dragged node ID and the selection stay the same).
      ue.properties[1] = obj.x;
      ue.properties[2] = obj.y;
      // Prepare to translate back. NOTE: this will also prepare for REDO.
      ue.properties[3] = tdx;
      ue.properties[4] = tdy;
      // Translate the entire graph.
      // NOTE: This does nothing if dx and dy both equal 0.
      MODEL.translateGraph(tdx, tdy);
      // Restore the selection as it was at the time of the "move" action.
      MODEL.selectList(ue.getSelection);
      // Move the selection back to its original position.
      MODEL.moveSelection(dx - tdx, dy - tdy);
    }
  }
  
  restoreFromXML(xml) {
    // Restore deleted objects from XML and add them to the UndoEdit's selection
    // (so that they can be RE-deleted).
    // NOTES:
    // (1) Store focal cluster, because this may change while initializing a
    //     cluster from XML.
    // (2) Set "selected" attribute of objects to FALSE, as the selection will
    //     be restored from UndoEdit.
    const n = parseXML(MODEL.xml_header + `<edits>${xml}</edits>`);
    if(n) {
      const
          ln = [],
          ppn = [],
          cn = [];  
      for(const c of n.childNodes) {
        // Immediately restore "independent" entities ...
        if(c.nodeName === 'dataset') {
          MODEL.addDataset(xmlDecoded(nodeContentByTag(c, 'name')), c);
        } else if(c.nodeName === 'actor') {
          MODEL.addActor(xmlDecoded(nodeContentByTag(c, 'name')), c);
        } else if(c.nodeName === 'note') {
          const obj = MODEL.addNote(c);
          obj.selected = false;
        } else if(c.nodeName === 'process') {
          const obj = MODEL.addProcess(xmlDecoded(nodeContentByTag(c, 'name')),
            xmlDecoded(nodeContentByTag(c, 'owner')), c);
          obj.selected = false;
        } else if(c.nodeName === 'product') {
          const obj = MODEL.addProduct(
            xmlDecoded(nodeContentByTag(c, 'name')), c);
          obj.selected = false;
        } else if(c.nodeName === 'chart') {
          MODEL.addChart(xmlDecoded(nodeContentByTag(c, 'title')), c);
        // ... but merely collect child nodes for other entities.
        } else if(c.nodeName === 'link' || c.nodeName === 'constraint') {
          ln.push(c);
        } else if(c.nodeName === 'product-position') {
          ppn.push(c);
        } else if(c.nodeName === 'cluster') {
          cn.push(c);
        }
      }
      // NOTE: Collecting the child nodes forlinks, product positions and clusters
      // saves the effort to iterate over ALL childnodes again.
      // First restore links and constraints.
      for(const c of ln) {
        let name = xmlDecoded(nodeContentByTag(c, 'from-name'));
        let actor = xmlDecoded(nodeContentByTag(c, 'from-owner'));
        if(actor != UI.NO_ACTOR) name += ` (${actor})`;
        let fn = MODEL.nodeBoxByID(UI.nameToID(name));
        if(fn) {
          name = xmlDecoded(nodeContentByTag(c, 'to-name'));
          actor = xmlDecoded(nodeContentByTag(c, 'to-owner'));
          if(actor != UI.NO_ACTOR) name += ` (${actor})`;
          let tn = MODEL.nodeBoxByID(UI.nameToID(name));
          if(tn) {
            if(c.nodeName === 'link') {
              MODEL.addLink(fn, tn, c).selected = false;
            } else {
              MODEL.addConstraint(fn, tn, c).selected = false;
            }
          }
        }
      }
      // Then restore product positions.
      // NOTE: These correspond to the products that were part of the
      // selection; all other product positions are restored as part of their
      // containing clusters.
      for(const c of ppn) {
        const obj = MODEL.nodeBoxByID(UI.nameToID(
          xmlDecoded(nodeContentByTag(c, 'product-name'))));
        if(obj) {
          obj.selected = false;
          MODEL.focal_cluster.addProductPosition(obj).initFromXML(c);
        }
      }
      // Lastly, restore clusters.
      // NOTE: Store focal cluster, because this may change while initializing
      // a cluster from XML.
      const fc = MODEL.focal_cluster;
      for(const c of cn) {
        const obj = MODEL.addCluster(xmlDecoded(nodeContentByTag(c, 'name')),
          xmlDecoded(nodeContentByTag(c, 'owner')), c);
        obj.selected = false;
/*
// TEMPORARY trace (remove when done testing)
if (MODEL.focal_cluster === fc) {
  console.log('NO refocus needed');
} else {
  console.log('Refocusing from ... to ... : ', MODEL.focal_cluster, fc);
}
*/
        // Restore original focal cluster because addCluster may shift focus
        // to a sub-cluster.
        MODEL.focal_cluster = fc;
      }
    }
    MODEL.clearSelection();
  }
  
  undo() {
    // Undo the most recent "undoable" action.
    this.recordChange();
    let ue;
    if(this.undoables.length > 0) {
      this.recordChange();
      UI.reset();
      // Get the action to be undone.
      ue = this.undoables.pop();
      // Focus on the cluster that was focal at the time of action.
      // NOTE: Do this WITHOUT calling UI.makeFocalCluster because this
      // clears the selection and redraws the graph.
      MODEL.focal_cluster = ue.cluster;
//console.log('undo' + ue.fullAction);
//console.log(ue);
      if(ue.action === 'move') {
        this.doMove(ue);
        // NOTE: `doMove` modifies the undo edit so that it can be used as redo edit.
        this.redoables.push(ue);
      } else if(ue.action === 'add') {
        // UNDO add means deleting the lastly added entity
        let obj = MODEL.objectByID(ue.object_id);
        if(obj) {
          // Prepare UndoEdit for redo.
          const ot = obj.type;
          // Set properties to [class name, identifier] (for tooltip display and redo)
          ue.properties = [ot, ue.object_id];
          // NOTE: `action` remains "add", but ID is set to null because otherwise
          // the fullAction method would fail.
          ue.object_id = null;
          // Push the "delete" UndoEdit back onto the undo stack so that XML will
          // be added to it.
          this.undoables.push(ue);
          // Mimic the exact selection state immediately after adding the entity
          MODEL.clearSelection();
          MODEL.select(obj);
          // Execute the proper delete, depending on the type of entity.
          if(ot === 'Link') {
            MODEL.deleteLink(obj);
          } else if(ot === 'Note') {
            MODEL.focal_cluster.deleteNote(obj);
          } else if(ot === 'Cluster') {
            MODEL.deleteCluster(obj);
          } else if(ot === 'Product') {
            // NOTE: `deleteProduct` deletes the ProductPosition, and the product
            // itself only if needed.
            MODEL.focal_cluster.deleteProduct(obj);
          } else if(ot === 'Process') {
            MODEL.deleteNode(obj);
          }
          // Clear the model's selection, since we've bypassed the regular
          // `deleteSelection` routine.
          MODEL.selection.length = 0;
          // Move the UndoEdit to the redo stack.
          this.redoables.push(this.undoables.pop());
        }
      } else if(ue.action === 'delete') {
        this.restoreFromXML(ue.xml);
        // Restore the selection as it was at the time of the "delete" action.
        MODEL.selectList(ue.getSelection);
        // Clear the XML (not useful for REDO delete).
        ue.xml = null;   
        this.redoables.push(ue);
      } else if(ue.action === 'drop' || ue.action === 'lift') {
        // Restore the selection as it was at the time of the action.
        MODEL.selectList(ue.getSelection);
        // NOTE: first focus on the original target cluster.
        MODEL.focal_cluster = MODEL.objectByID(ue.object_id);
        // Drop the selection "back" to the focal cluster.
        MODEL.dropSelectionIntoCluster(ue.cluster);
        // Refocus on the original focal cluster.
        MODEL.focal_cluster = ue.cluster;
        // NOTE: now restore the selection in THIS cluster!
        MODEL.selectList(ue.getSelection);
        // Now restore the position of the nodes.
        MODEL.setSelectionPositions(ue.properties);
        this.redoables.push(ue);
        // NOTE: A drop action will always be preceded by a move action.
        if(ue.action === 'drop') {
          // Double-check, and if so, undo this move as well.
          if(this.topUndo === 'move') this.undo();
        }
      } else if(ue.action === 'replace') {
        let uep = ue.properties,
            p = MODEL.objectByName(uep.p);
        // First check whether product P needs to be restored.
        if(!p && ue.xml) {
          const n = parseXML(MODEL.xml_header + `<edits>${ue.xml}</edits>`);
          if(n && n.childNodes.length) {
            let c = n.childNodes[0];
            if(c.nodeName === 'product') {
              p = MODEL.addProduct(
                  xmlDecoded(nodeContentByTag(c, 'name')), c);
              p.selected = false;
            }
          }
        }
        if(p) {
          // Restore product position of P in focal cluster.
          MODEL.focal_cluster.addProductPosition(p, uep.x, uep.y);
          // Restore links in/out of P.
          for(const id of uep.lt) {
            const l = MODEL.linkByID(id);
            if(l) {
              const ml = MODEL.addLink(l.from_node, p);
              ml.copyPropertiesFrom(l);
              MODEL.deleteLink(l);
            }
          }
          for(const id of uep.lf) {
            const l = MODEL.linkByID(id);
            if(l) {
              const ml = MODEL.addLink(p, l.to_node);
              ml.copyPropertiesFrom(l);
              MODEL.deleteLink(l);
            }
          }
          // Restore constraints on/by P.
          for(const id of uep.ct) {
            const c = MODEL.constraintByID(id);
            if(c) {
              const mc = MODEL.addConstraint(c.from_node, p);
              mc.copyPropertiesFrom(c);
              MODEL.deleteConstraint(c);
            }
          }
          for(const id of uep.cf) {
            const c = MODEL.constraintByID(id);
            if(c) c.fromNode = p;
            if(c) {
              const mc = MODEL.addConstraint(p, c.to_node);
              mc.copyPropertiesFrom(c);
              MODEL.deleteConstraint(c);
            }
          }
          // NOTE: Same UndoEdit object can be used for REDO.
          this.redoables.push(ue);
        } else {
          throw 'Failed to UNDO replace action';
        }
      }
      // NOTE: Identifiers may have changed => update the list.
      MODEL.inferIgnoredEntities();
      // Update the main window
      MODEL.focal_cluster.clearAllProcesses();
      UI.drawDiagram(MODEL);
      UI.updateButtons();
      // Update the Finder if needed
      if(ue.action !== 'move') FINDER.updateDialog();
    }
//console.log('undo');
//console.log(UNDO_STACK);
  }

  redo() {
    // Restore the model to its state prior to the last undo
    if(this.redoables.length > 0) {
      this.recordChange();
      UI.reset();
      let re = this.redoables.pop();
//console.log('redo ' + re.fullAction);
//console.log(UNDO_STACK);
      // Focus on the cluster that was focal at the time of action
      // NOTE: no call to UI.makeFocalCluster because this clears the selection
      // and redraws the graph
      MODEL.focal_cluster = re.cluster;
      if(re.action === 'move') {
        // NOTE: this is a mirror operation of the UNDO
        this.doMove(re);
        // NOTE: doMove modifies the RedoEdit so that it can be used as UndoEdit
        this.undoables.push(re);
        // NOTE: when next redoable action is "drop", redo this as well
        if(this.topRedo === 'drop') this.redo();
      } else if(re.action === 'add') {
//console.log('ADD redo properties:', re.properties);
        // NOTE: redo an undone "add" => mimick undoing a "delete"
        this.restoreFromXML(re.xml);
        // Clear the XML and restore the object identifier  
        re.xml = null;
        re.object_id = re.properties[1];
        this.undoables.push(re);
      } else if(re.action === 'delete') {
        // Restore the selection as it was at the time of the "delete" action
        MODEL.selectList(re.getSelection);
        this.undoables.push(re);
        // Then perform a delete action
        MODEL.deleteSelection();
      } else if(re.action === 'drop' || re.action === 'lift') {
        const c = MODEL.objectByID(re.object_id);
        if(c instanceof Cluster) MODEL.dropSelectionIntoCluster(c);
      } else if(re.action === 'replace') {
        const
            p = MODEL.objectByName(re.properties.p),
            r = MODEL.objectByName(re.properties.r);
        if(p instanceof Product && r instanceof Product) {
          MODEL.doReplace(p, r, re.properties.g);
        }
      }
      MODEL.focal_cluster.clearAllProcesses();
      UI.drawDiagram(MODEL);
      UI.updateButtons();
      if(re.action !== 'move') FINDER.updateDialog();
    } 
  }
} // END of class UndoStack
