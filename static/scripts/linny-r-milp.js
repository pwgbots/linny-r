/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-milp.js) implements the Node.js interface between
Linny-R and a MILP solver that has been installed on the computer where this
software is running.

NOTE: For browser-based Linny-R, this file should NOT be loaded, as it is
      already included in the server.
*/

/*
Copyright (c) 2017-2022 Delft University of Technology

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

const
    child_process = require('child_process'),
    fs = require('fs'),
    os = require('os'),
    path = require('path');

// Class MILPSolver implements the connection with the solver.
module.exports = class MILPSolver {
  constructor(name, workspace) {
    if(name) console.log(`Preferred solver: "${name}"`);
    this.solver_path = '';
    this.best_solver = '';
    this.default_solver = '';
    this.locateInstalledSolvers(workspace);
    if(!this.best_solver) {
      console.log('WARNING: No compatible solver found on this machine');
      return;      
    }
    this.id = name.toLowerCase();
    if(!(this.id in this.solver_list)) {
      if(this.id) {
        console.log('WARNING: Preferred solver was not found on this machine');
      }
      this.id = this.best_solver;
    }
    this.default_solver = this.id;
    console.log('Default solver:', this.name);
  }
  
  get name() {
    // Return the name of the current solver.
    const s = this.solver_list[this.id];
    if(s) return s.name;
    return '(no solver)';
  }
  
  changeDefault(id) {
    // Change default solver.
    if(this.solver_list.hasOwnProperty(id)) {
      this.id = id;
      this.default_solver = this.id;
      console.log('Default solver now is', this.name);
      return true;
    }
    console.log(`WARNING: Unknown solver ID "${id}"`);
    return false;
  }
 
  locateInstalledSolvers(workspace) {
    // Create a catalogue of solvers detected on this machine, and warn
    // if the preferred solver `name` is not found.
    this.solver_list = {};
    let sp,
        match,
        // Gurobi may have multiple versions installed. Therefore look
        // for the highest version number.
        max_vn = -1;
    const
        windows = os.platform().startsWith('win'),
        path_list = process.env.PATH.split(path.delimiter);
    // Iterate over all seprate paths in environment variable PATH. 
    for(let i = 0; i < path_list.length; i++) {
      // Assume that path is not a solver path.
      sp = '';
      // Check whether it is a Gurobi path.
      match = path_list[i].match(/gurobi(\d+)/i);
      if(match) sp = path_list[i];
      // If so, ensure that it has a higher version number.
      if(sp && parseInt(match[1]) > max_vn) {
        // Check whether command line version is executable.
        sp = path.join(sp, 'gurobi_cl' + (windows ? '.exe' : ''));
        try {
          fs.accessSync(sp, fs.constants.X_OK);
          console.log('Path to Gurobi:', sp);
          this.solver_list.gurobi = {name: 'Gurobi', path: sp};
          max_vn = parseInt(match[1]);
        } catch(err) {
          console.log(err.message);
          console.log(
              'WARNING: Failed to access the Gurobi command line application');
        }
      }
      if(sp) continue;
      // If no Gurobi path, check whether it is a CPLEX path.
      match = path_list[i].match(/[\/\\]cplex[\/\\]bin/i);
      if(match) {
        sp = path_list[i];
      } else {
        // CPLEX may create its own environment variable for its paths.
        match = path_list[i].match(/%(.*cplex.*)%/i);
        if(match) {
          const cpl = process.env[match[1]].split(path.delimiter);
          for(let i = 0; i < cpl.length && !sp; i++) {
            match = cpl[i].match(/[\/\\]cplex[\/\\]bin/i);
            if(match) sp = cpl[i];
          }
        }
      }
      if(sp) {
        // Check whether cplex(.exe) exists in its directory.
        sp = path.join(sp, 'cplex' + (windows ? '.exe' : ''));
        try {
          fs.accessSync(sp, fs.constants.X_OK);
          console.log('Path to CPLEX:', sp);
          this.solver_list.cplex = {name: 'CPLEX', path: sp};
        } catch(err) {
          console.log(err.message);
          console.log('WARNING: CPLEX application not found in', sp);
        }
        continue;
      }
      // If no CPLEX path, check whether it is a SCIP path.
      match = path_list[i].match(/[\/\\]scip[^\/\\]+[\/\\]bin/i);
      if(match) {
        // Check whether scip(.exe) exists in its directory
        sp = path.join(path_list[i], 'scip' + (windows ? '.exe' : ''));
        try {
          fs.accessSync(sp, fs.constants.X_OK);
          console.log('Path to SCIP:', sp);
          this.solver_list.scip = {name: 'SCIP', path: sp};
        } catch(err) {
          console.log(err.message);
          console.log('WARNING: SCIP application not found in', sp);
        }
      }
      // NOTE: Order of paths is unknown, so keep iterating.
    }
    // For macOS, look in applications directory if not found in PATH.
    if(!this.solver_list.gurobi && !windows) {
      console.log('Looking for Gurobi in /usr/local/bin');
      try {
        // On macOS and Unix, Gurobi is in the user's local binaries.
        sp = '/usr/local/bin/gurobi_cl';
        fs.accessSync(sp);
        this.solver_list.gurobi = {name: 'Gurobi', path: sp};
      } catch(err) {
        // No detection is not an error, so no action needed.
      }
    }
    // Check if lp_solve(.exe) exists in working directory.
    sp = path.join(workspace.working_directory,
        'lp_solve' + (windows ? '.exe' : '')); 
    try {
      fs.accessSync(sp, fs.constants.X_OK);
      console.log('Path to LP_solve:', sp);
      this.solver_list.lp_solve = {name: 'LP_solve', path: sp};
    } catch(err) {
      // No error because LP_solve may not be needed.
    }
    this.best_solver = '';
    let s = this.solver_list.gurobi;
    if(s) {
      s.ext = '.lp';
      s.user_model = path.join(workspace.solver_output, 'usr_model.lp');
      s.solver_model = path.join(workspace.solver_output, 'solver_model.lp');
      s.solution = path.join(workspace.solver_output, 'model.json');
      s.log = path.join(workspace.solver_output, 'model.log');
      // NOTE: Arguments 0, 1 and 2 will be updated for each solver run.
      s.args = [
          'timeLimit=30',
          'intFeasTol=5e-7',
          'MIPGap=1e-4',
          'JSONSolDetail=1',
          `LogFile=${s.log}`,
          `ResultFile=${s.solution}`,
          `ResultFile=${s.solver_model}`,
          `${s.user_model}`
        ];
      s.errors = {
        1: 'Model loaded -- no further information',
        2: 'Optimal solution found',
        3: 'The model is infeasible',
        4: 'The model is either unbounded or infeasible',
        5: 'The model is unbounded',
        6: 'Aborted -- Optimal objective is worse than specified cut-off',
        7: 'Halted -- Iteration limit exceeded',
        8: 'Halted -- Node limit exceeded',
        9: 'Halted -- Solver time limit exceeded',
       10: 'Halted -- Solution count limit exceeded',
       11: 'Halted -- Optimization terminated by user',
       12: 'Halted -- Unrecoverable numerical difficulties',
       13: 'The model is sub-obtimal',
       14: 'Optimization still in progress',
       15: 'User-specified objective limit has been reached'
      };
      this.best_solver = 'gurobi';   
    }
    s = this.solver_list.cplex;
    if(s) {
      s.ext = '.lp';
      s.user_model = path.join(workspace.solver_output, 'usr_model.lp');
      s.solver_model = path.join(workspace.solver_output, 'solver_model.lp');
      s.solution = path.join(workspace.solver_output, 'model.sol');
      // NOTE: CPLEX log file is located in the Linny-R working directory
      s.log = path.join(workspace.solver_output, 'cplex.log');
      // NOTE: CPLEX command line accepts space separated commands ...
      s.args = [
          `read ${s.user_model}`,
          `write ${s.solver_model} lp`,
          'set timelimit %T%',
          'set mip tolerances integrality %I%',
          'set mip tolerances mipgap %M%',
          'optimize',
          `write ${s.solution} 0`,
          'quit'
        ];
      // ... when CPLEX is called with -c option. Each command must then
      // be enclosed in double quotes.
      s.solve_cmd = `cplex -c "${s.args.join('" "')}"`;
      // NOTE: CPLEX error message is inferred from solution file.
      s.errors = {};
      this.best_solver = this.best_solver || 'cplex';
    }
    s = this.solver_list.scip;
    if(s) {
      s.ext = '.lp';
      s.user_model = path.join(workspace.solver_output, 'usr_model.lp');
      s.solver_model = path.join(workspace.solver_output, 'solver_model.lp');
      s.solution = path.join(workspace.solver_output, 'model.sol');
      s.log = path.join(workspace.solver_output, 'model.log');
      // NOTE: SCIP command line accepts space separated commands ...
      s.args = [
          'read', s.user_model,
          'write problem', s.solver_model,
          'set limit time %T%',
          'set numerics feastol %I%',
          // NOTE: MIP gap setting for SCIP is unclear, hence ignored.
          'optimize',
          'write solution', s.solution,
          'quit'
        ];
      // ... when SCIP is called with -c option. The command string (not
      // the separate commands) must then be enclosed in double quotes.
      // SCIP outputs its messages to the terminal, so these must be
      // caputured in a log file, hence the output redirection with > to
      // the log file.
      s.solve_cmd = `scip -c "${s.args.join(' ')}" >${s.log}`;
      s.errors = {
        1: 'User interrupt',
        2: 'Node limit reached',
        3: 'Total node limit reached',
        4: 'Stalling node limit reached',
        5: 'Time limit reached',
        6: 'Memory limit reached',
        7: 'Gap limit reached',
        8: 'Solution limit reached',
        9: 'Solution improvement limit reached',
       10: 'Restart limit reached',
       11: 'Optimal solution found',
       12: 'Problem is infeasible',
       13: 'Problem is unbounded',
       14: 'Problem is either infeasible or unbounded',
       15: 'Solver terminated by user'
      };
      this.best_solver = this.best_solver || 'scip';
    }
    s = this.solver_list.lp_solve;
    if(s) {
      s.ext = '.lp';
      s.user_model = path.join('user', 'solver', 'usr_model.lp');
      s.solver_model = path.join('user', 'solver', 'solver_model.lp');
      s.solution = path.join('.', 'user', 'solver', 'output.txt');
      s.args = [
          '-timeout %T%',
          '-v4',
          '-e %I%',
          '-gr %M%',
          '-epsel 1e-7',
          `-wlp ${s.solver_model}`,
          `>${s.solution}`,
          s.user_model
        ];
      // Execute file command differs across platforms.
      s.solve_cmd = (windows ? 'lp_solve.exe ' : './lp_solve ') +
          s.args.join(' ');
      s.errors = {
        '-2': 'Out of memory',
           1: 'The model is sub-optimal',
           2: 'The model is infeasible',
           3: 'The model is unbounded',
           4: 'The model is degenerative',
           5: 'Numerical failure encountered',
           6: 'Solver was stopped by user',
           7: 'Solver time limit exceeded',
           9: 'The model could be solved by presolve',
          25: 'Accuracy error encountered'  
        };
      this.best_solver = this.best_solver || 'lp_solve';
    }
  }
  
  solveBlock(sp) {
    // Save model file, execute solver, and return results.
    const result = {
        block: sp.get('block'),
        round: sp.get('round'),
        status: 0,
        error: '',
        messages: []
      };
    // Number of columns (= decision variables) is passed to ensure
    // that solution vector is complete and its values are placed in
    // the correct order.
    result.columns = parseInt(sp.get('columns')) || 0;
    // Request may specify a solver ID.
    const sid = sp.get('solver');
    if(sid) {
      this.id = (this.solver_list[sid] ? sid : this.default_solver);
    }
    if(!this.id) {
      result.status = -999;
      result.error = 'No MILP solver';
      return result;
    }
    const s = this.solver_list[this.id];
    console.log('Solve block', result.block, result.round, 'with', s.name);
    // Write the POSTed MILP model to a file.
    fs.writeFileSync(s.user_model, sp.get('data').trim());
    // Delete previous log file (if any).
    try {
      if(s.log) fs.unlinkSync(s.log);
    } catch(err) {
      // Ignore error.
    }
    // Delete previous solution file (if any).
    try {
      if(s.solution) fs.unlinkSync(s.solution);
    } catch(err) {
      // Ignore error
    }
    let timeout = parseInt(sp.get('timeout')),
        inttol = parseFloat(sp.get('inttol')),
        mipgap = parseFloat(sp.get('mipgap'));
    // Default timeout per block is 30 seconds.
    if(isNaN(timeout)) timeout = 30;
    // Default integer feasibility tolerance is 5e-7.
    if(isNaN(inttol)) {
      inttol = 5e-7;
    } else {
      inttol = Math.max(1e-9, Math.min(0.1, inttol));
    }
    // Default relative MIP gap is 1e-4.
    if(isNaN(mipgap)) {
      mipgap = 1e-4;
    } else {
      mipgap = Math.max(0, Math.min(0.5, mipgap));        
    }
    return this.runSolver(this.id, timeout, inttol, mipgap, result);
  }

  runSolver(id, timeout, inttol, mipgap, result) {
    // Set `id` to be the active solver if it is installed, and set the
    // solver parameters. NOTE: These will have been validated.
    this.id = (this.solver_list[id] ? id : this.default_solver);
    let spawn,
        status = 0,
        error = '',
        s = this.solver_list[this.id];
    try {
      if(this.id === 'gurobi') {
        // When using Gurobi, standard spawn with arguments works well.
        s.args[0] = `timeLimit=${timeout}`;
        s.args[1] = `intFeasTol=${inttol}`;
        s.args[2] = `MIPGap=${mipgap}`;
        const options = {windowsHide: true};
        spawn = child_process.spawnSync(s.path, s.args, options);
      } else {
        // CPLEX, SCIP and LP_solve will not work when the arguments are
        // passed as an array. Therefore they are executed with a single
        // command string that includes all arguments.
        // Spawn options must be set such that (1) the command is executed
        // within an OS shell script, (2) output is ignored (warnings should
        // not also appear on the console, and (3) Windows does not open
        // a visible sub-process shell window.
        const
            cmd = s.solve_cmd.replace('%T%', timeout)
                .replace('%I%', inttol).replace('%M%', mipgap),
            options = {shell: true, stdio: 'ignore', windowsHide: true};
        if(this.id === 'cplex') {
          // NOTE: CPLEX must run in user directory.
          options.cwd = 'user/solver';
          // Delete previous solver model file (if any).
          try {
            if(s.solver_model) fs.unlinkSync(s.solver_model);
          } catch(err) {
            // Ignore error when file not found.
          }
        }
        spawn = child_process.spawnSync(cmd, options);
      }
      status = spawn.status;
    } catch(err) {
      status = -13;
      error = err;
    }
    if(status) console.log(`Process status: ${status}`);
    if(status in s.errors) {
      // If solver exited with known status code, report message
      result.status = status;
      result.error = s.errors[status];
    } else if(status !== 0) {
      result.status = -13;
      const msg = (error ? error.message : 'Unknown error');
      result.error += 'ERROR: ' + msg;
    }
    return this.processSolverOutput(result);
  }

  processSolverOutput(result) {
    // Read solver output files and return solution (or error).
    const
        x_values = [],
        x_dict = {},
        getValuesFromDict = () => {
          // Returns a result vector for as many real numbers (as strings!)
          // as there are columns (0 if not reported by the solver).
          // First sort on variable name
          const vlist = Object.keys(x_dict).sort();
          // Start with column 1.
          let col = 1;
          for(let i = 0; i < vlist.length; i++) {
            const
                v = vlist[i],
                // Variable names have zero-padded column numbers, e.g. "X001".
                vnr = parseInt(v.substring(1));
            // Add zeros for unreported variables until column number matches.
            while(col < vnr) {
              x_values.push(0);
              col++;
            }
            x_values.push(x_dict[v]);
            col++;
          }
          // Add zeros to vector for remaining columns.
          while(col <= result.columns) {
            x_values.push('0');
            col++;
          }
          // No return value; function operates on x_values.
        };

    const s = this.solver_list[this.id];
    // Solver output has different formats, hence separate routines.
    if(this.id === 'gurobi') {
      // `messages` must be an array of strings.
      result.messages = fs.readFileSync(s.log, 'utf8').split(os.EOL);
      if(result.status !== 0) {
        // Non-zero solver exit code may indicate expired license.
        result.error = 'Your Gurobi license may have expired';
      } else {
        try {
          // Read JSON string from solution file.
          const
              json = fs.readFileSync(s.solution, 'utf8').trim(),
              sol = JSON.parse(json);
          result.seconds = sol.SolutionInfo.Runtime;
          // NOTE: Status = 2 indicates success!
          if(sol.SolutionInfo.Status !== 2) {
            result.status = sol.SolutionInfo.Status;
            result.error = s.errors[result.status];
            if(!result.error) result.error = 'Unknown solver error';
            console.log(`Solver status: ${result.status} - ${result.error}`);
          }
          // Objective value.
          result.obj = sol.SolutionInfo.ObjVal;
          // Values of solution vector.
          if(sol.Vars) {
            // Fill dictionary with variable name: value entries.
            for(let i = 0; i < sol.Vars.length; i++) {
              x_dict[sol.Vars[i].VarName] = sol.Vars[i].X;
            }
            // Fill the solution vector, adding 0 for missing columns.
            getValuesFromDict();
          }
        } catch(err) {
          console.log('WARNING: Could not read solution file');
          console.log(err.message);
          result.status = -13;
          result.error = 'No solution found';
        }
      }
    } else if(this.id === 'cplex') {
      result.seconds = 0;
      const
          msg = fs.readFileSync(s.log, 'utf8'),
          no_license = (msg.indexOf('No license found') >= 0),
          // NOTE: Solver reports time with 1/100 secs precision.
          mst = msg.match(/Solution time \=\s+(\d+\.\d+) sec/);
      if(mst && mst.length > 1) result.seconds = parseFloat(mst[1]);
      // `messages` must be an array of strings.
      result.messages = msg.split(os.EOL);
      let solved = false,
          output = [];
      if(no_license) {
        result.error = 'Too many variables for unlicensed CPLEX solver';
        result.status = -13;
      } else if(result.status !== 0) {
        // Non-zero solver exit code indicates serious trouble.
        result.error = 'CPLEX solver terminated with error';
        result.status = -13;
      } else {
        try {
          output = fs.readFileSync(s.solution, 'utf8').trim();
          if(output.indexOf('CPLEXSolution') >= 0) {
            solved = true;
            output = output.split(os.EOL);
          }
        } catch(err) {
          console.log('No CPLEX solution file');
        }
      }
      if(solved) {
        // CPLEX saves solution as XML, but for now just extract the
        // status and then the variables.
        let i = 0;
        while(i < output.length) {
          const o = output[i].split('"');
          if(o[0].indexOf('objectiveValue') >= 0) {
            result.obj = o[1];
          } else if(o[0].indexOf('solutionStatusValue') >= 0) {
            result.status = o[1];
          } else if(o[0].indexOf('solutionStatusString') >= 0) {
            result.error = o[1];
            break;
          }
          i++;
        }
        if(['1', '101', '102'].indexOf(result.status) >= 0) {
          result.status = 0;
          result.error = '';
        }
        // Fill dictionary with variable name: value entries.
        while(i < output.length) {
          const m = output[i].match(/^.*name="(X[^"]+)".*value="([^"]+)"/);
          if(m !== null)  x_dict[m[1]] = parseFloat(m[2]);
          i++;
        }
        // Fill the solution vector, adding 0 for missing columns.
        getValuesFromDict();
      } else {
        console.log('No solution found');
      }
    } else if(this.id === 'scip') {
      result.seconds = 0;
      // `messages` must be an array of strings.
      result.messages = fs.readFileSync(s.log, 'utf8').split(os.EOL);
      let solved = false,
          output = [];
      if(result.status !== 0) {
        // Non-zero solver exit code indicates serious trouble.
        result.error = 'SCIP solver terminated with error';
      } else {
        try {
          output = fs.readFileSync(
              s.solution, 'utf8').trim().split(os.EOL);
        } catch(err) {
          console.log('No SCIP solution file');
        }
        // Look in messages for solver status and solving time.
        for(let i = 0; i < result.messages.length; i++) {
          const m = result.messages[i];
          if(m.startsWith('SCIP Status')) {
            if(m.indexOf('problem is solved') >= 0) {
              if(m.indexOf('infeasible') >= 0) {
                result.status = (m.indexOf('unbounded') >= 0 ? 14 : 12);
              } else if(m.indexOf('unbounded') >= 0) {
                result.status = 13;
              } else {
                solved = true;
              }
            } else if(m.indexOf('interrupted') >= 0) {
              if(m.indexOf('time limit') >= 0) {
                result.status = 5;
              } else if(m.indexOf('memory limit') >= 0) {
                result.status = 6;
              }
            }
            if(result.status) {
              result.error = this.solver_list.scip.errors[result.status];
            }
          } else if (m.startsWith('Solving Time')) {
            result.seconds = parseFloat(m.split(':')[1]);
          }
        }
      }
      if(solved) {
        // Look for line with first variable.
        let i = 0;
        while(i < output.length && !output[i].startsWith('X')) i++;
        // Fill dictionary with variable name: value entries .
        while(i < output.length) {
          const v = output[i].split(/\s+/);
          x_dict[v[0]] = parseFloat(v[1]);
          i++;
        }
        // Fill the solution vector, adding 0 for missing columns.
        getValuesFromDict();
      } else {
        console.log('No solution found');
      }
    } else if(this.id === 'lp_solve') {
      // Read solver messages from file.
      // NOTE: Linny-R client expects a list of strings.
      const
          output = fs.readFileSync(s.solution, 'utf8').trim().split(os.EOL),
          msgs = [];
      result.seconds = 0;
      let i = 0,
          solved = false;
      while(i < output.length && !solved) {
        msgs.push(output[i]);
        const m = output[i].match(/in total (\d+\.\d+) seconds/);
        if(m && m.length > 1) result.seconds = parseFloat(m[1]);
        solved = output[i].startsWith('Value of objective function:');
        i++;
      }
      result.messages = msgs;
      if(solved) {
        // Look for line with first variable
        while(i < output.length && !output[i].startsWith('X')) i++;
        // Fill dictionary with variable name: value entries 
        while(i < output.length) {
          const v = output[i].split(/\s+/);
          x_dict[v[0]] = parseFloat(v[1]);
          i++;
        }
        // Fill the solution vector, adding 0 for missing columns
        getValuesFromDict();
      } else {
        console.log('No solution found');
      }
    }
    
    // Add data and model to the results dict
    result.data = {
        block: result.block,
        round: result.round,
        seconds: result.seconds,
        x: x_values
      };
    try {
      result.model = fs.readFileSync(s.solver_model, 'utf8');
    } catch(err) {
      console.log(err.toString());
      result.model = 'ERROR reading solver model file: ' + err;
    }
    if(result.error) console.log('Solver error:', result.error);
    return result;
  }

}; // END of class MILPSolver (semicolon needed because of export statement)
