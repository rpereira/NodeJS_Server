###Before Starting
This Node.js program was designed to run the following web multiplayer game:


###Requirements
To run this code, you'll need (to install) the following NodeJS modules:
```javascript
var http   = require('http');
var url    = require('url');
var check  = require('validator').check;
var mysql  = require('mysql');
var Chance = require('chance');
var crypto = require('crypto');
```


###Web services
Function | Parameters | Description | Observation
--- | --- | --- | ---
register | name, pass | Registers a player with a given password
join | name, pass, type, size | Joins a player to a specified game
leave | name, key, game | Give up from wating for an opponent
notify | name, key, game, row, col | Notifies the server when a tile is removed
update | name, key, game | Updates moves, score and winner | Server-Sent Event
ranking | type, size | Reports the ranking of the specified game
questions | type, size | Generates questions to single player games


###Version 1.0.0 Notes
1. All info sent from the user is validated before being used.
2. Service implemented using HTTP protocol.
3. Module crypto is used to encrypt the user password before storing it on the database.
4. MySQL queries use placeholders to prevent code injection.
