/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This NodeJS script (post-install.js) creates a launch script for Linny-R
that facilitates start-up: the user can then type `linny-r` at the command
line prompt, and also create a clickable icon as desktop shortcut.

For macOS, the script file is `linny-r.command`, for Windows `linny-r.bat`.
The script comprises two commands:

  cd path/to/linny-r/directory
  node node_modules/linny-r/server launch
  
since Windows also supports the slash as path separator. The "launch"
command tells the script `server.js` to start Linny-R in the default
web browser. 

Comments are added to the script file to facilitate customization of the
scripts by the user. The README.md file explains how the script file can be
used for single-click launch of Linny-R, and how the "workspace" parameter
can be used in a multi-user network environment to provide individual
workspaces for users.
*/
/*
Copyright (c) 2020-2022 Delft University of Technology

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

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
    path = require('path'),
    WORKING_DIRECTORY = process.cwd(),
    lines = [
        '# The first line (without the comment symbol #) should be like this:',
        '# cd ',
        '',
        '# Then this command to launch the Linny-R server should work:',
        'node ' + path.join('node_modules', 'linny-r', 'server') + ' launch'
      ];
let sp;
if(PLATFORM.startsWith('win')) {
  sp = path.join(WORKING_DIRECTORY, 'linny-r.bat');
  lines[1] += 'C:\\path\\to\\main\\Linny-R\\directory';
} else {
  sp = path.join(WORKING_DIRECTORY, 'linny-r.command'); 
  lines[1] += '/path/to/main/Linny-R/directory';
}
lines[2] = 'cd ' + WORKING_DIRECTORY;
try {
  try {
    fs.accessSync(sp);
  } catch(err) {
    // Only write the script content if the file it does not yet exist
    console.log('Creating launch script:', sp);
    let code = lines.join(os.EOL);
    if(PLATFORM.startsWith('win')) code = code.replace('#', '::');
    fs.writeFileSync(sp, code, 'utf8');
  }
} catch(err) {
  console.log('WARNING: Failed to create launch script');
}
