<img src="https://sysmod.tbm.tudelft.nl/linny-r/images/logo.png" height="55px" alt="Linny-R">

<p>Linny-R is an executable graphical specification language for mixed integer 
<a href="https://en.wikipedia.org/wiki/Linear_programming" target="_blank">linear programming</a> (MILP) problems, especially
<a href="https://en.wikipedia.org/wiki/Unit_commitment_problem_in_electrical_power_production" target="_blank">unit commitment problems</a> (UCP) and
<a href="https://en.wikipedia.org/wiki/Generation_expansion_planning" target="_blank">generation expansion planning</a> (GEP).</p>

The graphical language and WYSIWYG model editor are developed by **Pieter Bots** at
<a href="https://tudelft.nl" target="_blank">Delft University of Technology</a>.
 
Originally implemented in Delphi Pascal, Linny-R is now developed in HTML+CSS+JavaScript
so as to be platform-independent and 100% transparent open source (under the MIT license).
The software comprises a server that runs on **Node.js**,
and a graphical user interface (GUI) that runs in any modern browser.

User documentation for Linny-R is still scant, but it is growing. You can contribute yourself (in "wiki fashion")
via the official user documentation site <a href="https://linny-r.info" target="_blank">https://linny-r.info</a>.
Technical documentation will be developed on GitHub: https://github/pwgbots/linny-r/wiki

## Installing Node.js

Linny-R is developed as a JavaScript package, and requires that **Node.js** is installed on your computer. 
This software can be downloaded from <a href="https://nodejs.org" target="_blank">https://nodejs.org</a>. 
Make sure that you choose the correct installer for your computer.
Linny-R is developed using the _current_ release. Presently (October 2022) this is 18.11.0. 

Run the installer and accept the default settings.
There is **no** need to install the optional _Tools for Native Modules_.

Open the Command Line Interface (CLI) of your computer. 
On macOS, this will be `Terminal`, on Windows `Command Prompt`. 
Verify the installation by typing:

``node --version``

The response should be the version number of Node.js, for example: v18.10.0.

## Installing Linny-R
It is advisable to install Linny-R in a directory on your computer, not in a cloud. 
In this installation guide, the path to this directory is denoted by `WORKING_DIRECTORY`,
so in all commands you should replace this with the actual directory path.
On a Windows machine you may choose something like `C:\Users\xyz\Documents\Linny-R`,
and on a macOS machine probably `/Users/xyz/Linny-R`.

To install Linny-R in this directory, first create it:

``mkdir WORKING_DIRECTORY``

then change to it:

``cd WORKING_DIRECTORY``

and then type at the command line prompt: 

``npm install --prefix . linny-r``

**NOTE:** The spacing around the dot is important.

After installation has completed, `WORKING_DIRECTORY` should have this directory tree structure:

<pre>
WORKING_DIRECTORY
 |
 +-node_modules
    |
    +-@xmldom
    |
    +-linny-r
       |
       +-static
          |
          +-fonts
          |
          +-images
          |
          +-scripts
          |
          +-sounds
</pre>

`WORKING_DIRECTORY` should contain two JSON files `package.json` and `package-lock.json`
that should **not** be removed, or you will have to re-install Linny-R. It should also contain
a script file to facilitate (single click) launch: on a macOS machine the shell script `linny-r.command`,
on a Windows machine the batch script `linny-r.bat`. By default, this script file contains
two commands: first change to the Linny-R directory and then tell Node.js to launch the
start the Linny-R server.

**NOTE:** When configuring Linny-R for a network environment where individual users
each have their personal work space (e.g., a virtual drive U:), you must edit this script file,
adding the argument `workspace=path/to/workspace` to the `node` command.
This will instruct Linny-R to create the `user` directory in this workspace directory
instead of the Linny-R directory.

The `linny-r` directory should contain this file `README.md`,
the files `server.js` and `console.js` that will be run by Node.js,
and the sub-directory `static`. This `static` directory should contain three HTML files: 

* `index.html` (the browser-based GUI) 
* `show-png.html` (to render SVG diagrams as PNG images)
* `show-diff.html` (to display differences betwee two Linny-R models)

It should also contain the style sheet `linny-r.css` required by the GUI.

The sub-directories of `static` contain files that are served to the browser by the script
`server.js` when it is running in Node.js. 

## Configuring the MILP solver

Linny-R presently supports two MILP solvers: Gurobi  and LP_solve. 
Gurobi is _considerably_ more powerful than the open source LP_solve solver that has powered Linny-R since 2009,
but it requires a license.
Academic licenses can be obtained by students and staff of eligible institutions. 

#### Installing Gurobi

More information on how to obtain a license, and instructions for installing
Gurobi on your computer can be obtained via this URL:
https://www.gurobi.com/academia/academic-program-and-licenses/

When running a model, Linny-R will try to execute the command line application `gurobi_cl`.
It will look for this application in the directory specified in the environment variable PATH on your computer.

When installing Gurobi, please accept the default file locations that are proposed by the installer.
Then do **not** move Gurobi files to some other directory, as this is bound to cause problems.

#### Installing LP_solve

The LP_solve software is open source and can be downloaded via this URL:
https://sourceforge.net/projects/lpsolve

To facilitate installation, the executable files for Windows and macOS can be downloaded from the Linny-R website at Delft University of Technology:
https://sysmod.tbm.tudelft.nl/linny-r/lp_solve

There you will find links to download LP_solve applications that have been compiled for different platforms.
If you do not know which platform to choose, run Linny-R as described below, and the platform will be listed in its output.
If no matching LP_solve version is listed, you can try to compile the software from its source.
How to do this is explained on the page "Installing LP_solve on a Mac" on the Linny-R documentation site:
https://linny-r.info 

When you have downloaded the file (just `lp_solve` for macOS, `lp_solve.exe` for Windows), 
you must copy or move this file to your `WORKING_DIRECTORY`,
as this is where Linny-R will look for it when it does not find Gurobi.

On a macOS machine, you must then make the file `lp_solve` executable.
Open Terminal and change to your Linny-R directory, and then type:

``chmod +x lp_solve``

When you then type:

``./lp_solve -h``

a window may appear that warns you that the software may be malicious.
To allow running LP_solve, you must then go to Security & Privacy (via System Preferences)
and there click the Open Anyway button in the General pane to confirm that you wish to use LP_solve.
Then return to Terminal and once more type `./lp_solve -h`.
The response should then be a listing of all the command line options of LP_solve.
If you reach this stage, Linny-R will be able to run LP_solve.

## Running Linny-R

Open the Command Line Interface (CLI) of your computer, change to your `WORKING_DIRECTORY` and type:

``node node_modules/linny-r/server launch``

This response should be something similar to:

<pre>
Node.js server for Linny-R version 1.1.9
Node.js version: v18.10.0
... etc.
</pre>

Meanwhile, your default web browser should have opened a tab for the local server URL,
which by default will be http://127.0.0.1:5050.
The Linny-R GUI should show in your browser window, 
while in the CLI you should see a long series of server log messages like:

<pre>
Static file: /index.html
Static file: /scripts/iro.min.js
Static file: /images/open.png
... etc.
</pre>

After loading into the browser, Linny-R will try to connect to the solver.
If successful, a notification (blue background) will appear on the status bar at the bottom of the window,
stating the name of the solver.

You can then test the GUI by creating a simple model.
Make one that has at least one process that outputs a product, 
and this product must have a price or a set lower bound, otherwise the model will have no objective function.
Then click on the _Solve_ button at the bottom of the left-hand tool bar.
The Linny-R icon in the upper left corner should start rotating, while the status bar at the bottom should display:

<pre>
Solving block 1 of 1
</pre>

For a small test model, this message should appear only very briefly,
and then the diagram will be updated to reflect the obtained solution.
Meanwhile, in the CLI, you should see a server log message like:

<pre>
Solve block 1 a
</pre>

To end a modeling session, you can shut down the server by clickicng on the local host icon
in the upper right corner of the Linny-R GUI in your browser, confirm that you want to leave,
and then close your browser (tab). If you do not shut down the server from the browser,
you can also stop the server by repeatedly pressing ``Ctrl+C`` in the CLI box.

## Command line options

Optionally, you can add more arguments to the `node` command:

<pre>
dpi=[number]       to overrule the default resolution (300 dpi) for Inkscape 
launch             to automatically launch Linny-R in your default browser
port=[number]      to overrule the default port number (5050)
solver=[name]      to overrule the default sequence (Gurobi, LP_solve)
workspace=[path]   to overrule the default path for the user directory
</pre>

## Click-start for Linny-R

To facilitate start-up, you can create a shortcut icon for Linny-R on your desktop. 

On a Windows machine, open the _File Explorer_, select your Linny-R folder,
right-click on the batch file `linny-r.bat`, and select the _Create shortcut_ option. 
Then right-click on the shortcut file to edit its properties, and click the _Change Icon_ button.
The dialog that then appears will allow you to go to the sub-folder `node_modules\linny-r\static\images`,
where you should select the file `linny-r.ico`.
Finally, rename the shortcut to `Linny-R` and move or copy it to your desktop.

On a macOS machine, open _Terminal_ and change to your Linny-R directory, and then type:

``chmod +x linny-r.command``

to make the script file executable.
To set the icon, open the folder that contains the file `linny-r.command`,
click on its icon (which still is plain) and open the _Info dialog_ by pressing ``Cmd+I``.
Then open your Linny-R folder in _Finder_, change to the sub-folder `node_modules/linny-r/static/images`, 
and from there drag/drop the file `linny-r.icns` on the icon shown in the top left corner of the _Info dialog_.

## User workspace

The user workspace is created when the server is run for the first time.
The sub-directories of this directory `user` are used by Linny-R to store files.

* `autosave` will contain models that have been _auto-saved_ 
* `channel` and `callback` will be used to interact with Linny-R via its _Receiver_ 
* `diagrams` will be used to render Scalable Vector Graphics (SVG) files as
  Portable Network Graphics (PNG) using Inkscape (if installed)
* `modules` will contain models stored in the `local host` _repository_
* `solver` will contain the files that are exchanged with the Mixed Integer Linear Programming (MILP) solver
  (the names of the files that will appear in this directory may vary, depending on the MILP-solver you use)

By default, the `user` directory is created in your `WORKING_DIRECTORY`.
You can overrule this by specifying the path to another directory when you start the server.
Note that doing this will create a new, empty workspace (the directories listed above)
in the specified path. It will **not** affect or duplicate information from existing workspaces.

## Installing Inkscape

Linny-R creates its diagrams and charts as SVG images. 
When you download a diagram, it will be saved as a .svg file.
These files can be viewed and edited using Inkscape, an open source vector graphics editor. 

As it may be tedious to first save a diagram as SVG and then render it manually as a bitmap image, 
Linny-R features a *Render diagram as bitmap* button on the top toolbar, and on the bottom toolbar of the _Chart manager_.
When you click it, Linny-R will send the image as SVG to the server. 
The server script will save the SVG in the `user/diagrams` sub-directory, 
and then try to execute an Inkscape command that will convert this SVG to a PNG image file in the same directory.
The file name will be `diagram-(date and time).png`. 
Meanwhile, the browser will have opened a new tab that will be "waiting" for this PNG image to become available. 
If rendering was successful, the image will appear in this browser tab; 
if rendering failed, the original SVG image will be shown.

To install Inkscape, please look here: https://inkscape.org/release

Linny-R will automatically detect whether Inkscape is installed by searching for it in the environment variable PATH on your computer.
On a macOS computer, Linny-R will look for Inkscape in /Applications/Inkscape.app/Contents/MacOS.

**NOTE:** The current installation wizard for Inkscape (version 1.2) does **not** add the application to the PATH variable,
so you need to do this yourself.

## Using Linny-R console

The console-only version of Linny-R allows you to run a Linny-R model without a web browser.
This may be useful when you want run models from a script (shell script, Python, ...). 
If you open a CLI box, change to your `WORKING_DIRECTORY`, and then type:

``node node_modules/linny-r/console``  _(on Windows, use backslashes)_

you will see the command line options that allow you to run models in various ways.

**NOTE: The console-only version is still in development, and does not provide all functions yet.**

## Troubleshooting problems

If during any of the steps above you encounter problems, please try to diagnose them and resolve them yourself.
You can find a lot of useful information on the Linny-R documentation website:
<a href="https://linny-r.info" target="_blank">https://linny-r.info</a>.

To diagnose a problem, always look in the CLI box where Node.js is running, 
as informative server-side error messages will appear there.

Then also look at the console window of your browser. 
Most browsers offer a _Web Developer Tools_ option via their application menu.
This will allow you to view the browser console, which will display JavaScript errors in red font.

If you've tried hard, but failed, you can try to contact Pieter Bots at ``p.w.g.bots@tudelft.nl``
