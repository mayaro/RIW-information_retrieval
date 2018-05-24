# Information Retrieval college project

### SCOPE: Creating a small crawling robot

### FEATURES:
 - Saves parsed web pages on the disk based on a fire and forget mechanism
 - Added multithreading, using the master - slave paradigm
 - Handled 3xx redirects on 5 levels tops
 - Enforced REP rules (both page and domain)
 - Created own DNS and HTTP clients
 - Handled DNS caching
 - Performance of ~3000 pages/minute (with 1 master, 4 fetchers and a gigabit internet connection)

### HOW TO RUN:
 - Run `npm install` to install all node modules required
 - Modify the save path in `./fetcher.js`
 - Optionally, modify the number of fetchers to work with inside `./master.js`

### GIT Repository:
`
https://github.com/mayaro/RIW-information_retrieval
`