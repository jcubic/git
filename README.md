# GIT Web Terminal

This project was created using [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) and other
libraries, you can check which ones was used when you
[follow this link](https://jcubic.github.io/git/#[[0,1,"credits"]]) that will execute
`credits` command in terminal.

First version of the app was created on [codepen](https://codepen.io/jcubic/pen/Gddxpg).

### Usage

Steps to make changes to remote git repo (tested with github):

1. clone repo using `git clone` (using https url),
2. cd to directory,
3. edit file using `vi` (TODO: add emacs command using ymacs),
4. use `git login` and put your credentials (user/pass is for push and the rest is for commit),
5. use `git commit -am "message"` or `git add -A` then `git commit -m "<MESSAGE>"`,
6. use `git push` to push your changes to remote.

### Contributors

To see list of contributors you can check [credits command](https://jcubic.github.io/git/#[[0,1,"credits"]]).

### Proxy

Proxy used to fetch files from remote repositories is located on my hosting
[https://jcubic.pl/proxy.php](https://jcubic.pl/proxy.php). You can read the source code of that file
[here](https://github.com/jcubic/git/blob/master/proxy.php).

### License

Licensed under [MIT](http://opensource.org/licenses/MIT) license

Copyright (c) 2018 [Jakub Jankiewicz](http://jcubic.pl/jakub-jankiewicz)
