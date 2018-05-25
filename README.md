# GIT Web Terminal

This project was created using [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) and other
libraries, you can check which ones was used when you
<a href="https://jcubic.github.io/git/#&#91;&#91;0,1,&quot;credits&quot;&#93;&#93;">follow this link</a>
that will execute `credits` command in terminal.

First version of the app was created on [codepen](https://codepen.io/jcubic/pen/Gddxpg).

### Usage

Steps to make changes to remote git repo (tested with github):

1. clone repo using `git clone` (using https url),
2. cd to directory,
3. edit file using `vi` or `emacs`,
4. use `git login` and put your credentials (user/pass is for push and the rest is for commit),
5. use `git commit -am "message"` or `git add -A` then `git commit -m "<MESSAGE>"`,
6. use `git push` to push your changes to remote.

### Web app viewer

If you're working on web app you can open it from browser just prefix the path with `__browserfs__` the app
is using service worker to serve files from browser fs. So if you clone this repo you will be able to view the local file
using https://jcubic.github.io/git/__browserfs__/git/. If you open directory that don't have index.html it will
display page with directory listing like normal web server.

### Contributors

To see list of contributors you can check
<a href="https://jcubic.github.io/git/#&#91;&#91;0,1,&quot;credits&quot;&#93;&#93;">credits command</a>.

### Proxy

Proxy used to fetch files from remote repositories is located on my hosting
[https://jcubic.pl/proxy.php](https://jcubic.pl/proxy.php). You can read the source code of that file
[here](https://github.com/jcubic/git/blob/357848672683d1959dbd1fa3d5023302a4151474/proxy.php) (it's in commit because
I've needed to delete it because of GPL license).

### License

Licensed under [MIT](http://opensource.org/licenses/MIT) license

Copyright (c) 2018 [Jakub Jankiewicz](http://jcubic.pl/jakub-jankiewicz)
