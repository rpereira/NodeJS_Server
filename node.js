// required modules
var http   = require('http');
var url    = require('url');
var check  = require('validator').check;
var mysql  = require('mysql');
var Chance = require('chance');
var crypto = require('crypto');

var port = process.env.port || 8026;

//  Hash table with all implemented resources
var web_resources =
{
    'register' : ['name', 'pass'],
    'ranking'  : ['type', 'size'],
    'questions': ['type', 'size'],
    'join'     : ['name', 'pass', 'type', 'size'],
    'leave'    : ['name', 'key', 'game'],
    'notify'   : ['name', 'key', 'game', 'row', 'col'],
    'update'   : ['name', 'key', 'game']
};

// Associative array to validate user' info
var regular_expressions =
{
    'username': /^\w+$/,                            // allow only letters, numbers and '_'
    'password': /^(?=.*[A-Z])(?=.*\d)/,             // at least 1 upper letter and 1 digit
    'key'     : /^.{1,32}/,                         // allow a sequence of 32 hexadecimal digits
    'type'    : /^(antonyms|synonyms|arithmetic|translation)/,
    'size'    : /^[1-3]/,                           // allow one digit in the range [1,3]
    'row'     : /^[1-5]/,                           // allow one digit in the range [1,5]
    'col'     : /^[1-5]/,                           // allow one digit in the range [1,5]
    'game'    : /\d{4,}/                            // allow at least 5 digits
};

var waiting_games = [];     // games that are waiting for another player
var games_running = [];     // games that are running
var data          = [];     // data to send in the Server Sent-Event    
var clients       = [];     // response objects of each player
var players       = [];     // players of each game
var game_id       = 1000;   // id to attribute to each game

// Relational database connection' parameters
var pool = mysql.createPool(
{
    host           : 'localhost',
    user           : 'up201107664',
    password       : 'olaFCUP93',
    database       : 'up201107664',
    connectionLimit: 25           // max pool connections
});

/**
 * class Players' constructor
 *
 * @param name    The name of the player (username)
 * @param key     The key for the game of the player  
 */
function Player(name, key)
{
    this.name = name;
    this.key  = key;
}

/** 
 * Server module
 */
var server = http.createServer(function (req, res)
{
    // Headers
    res.writeHead(200, { 'Content-Type': 'application/json; ; charset=utf-8', 'Access-Control-Allow-Origin': '*' });

    // URL components
    var url_str    = req.url;
    var parsed_url = url.parse(url_str, true);
    var path_name  = parsed_url.pathname.substring(1);
    var query      = parsed_url.query;

    // Verifies if the user requested a valid url-path
    try
    {
        validateWebResources(res, path_name, query);
    }
    catch (error)
    {
        res.end(JSON.stringify({ "error": error }));
    }
});

/*
 * Checks if the url-path is valid.
 *  
 * @param res         The server response
 * @param path_name   The path name
 * @param query       Client's query
 */
function validateWebResources(res, path_name, query)
{
    switch (path_name)
    {
        case 'register':
            register(res, path_name, query);
            break;
        case 'ranking':
            ranking(res, path_name, query);
            break;
        case 'questions':
            questions(res, path_name, query);
            break;
        case 'join':
            join(res, path_name, query);
            break;
        case 'leave':
            leave(res, path_name, query);
            break;
        case 'notify':
            notify(res, path_name, query);
            break;
        case 'update':
            update(res, path_name, query);
            break;
        default:
            throw ("Unknown function " + path_name);
            break;
    }
}

/**
 * Registers a pair username-password.
 * 
 * @param res         The server response
 * @param path_name   The path name
 * @param query       The parsed query
 */
function register(res, path_name, query)
{
    try
    {
        var validation = validateQuery(res, path_name, query);

        // Valid login data
        if (validation == true)
        {
            login(query);
            _registration(res, query);
        }
    }
    catch (error)
    {
        res.end(JSON.stringify({ "error": error.message }));
    }
}

/**
 * Validates the login data provided by the user.
 *
 * @param res     The server response
 * @param query   Client's query
 */
function login(query)
{
    var name = query.name;
    var pass = query.pass;

    // checks if the provided username matches the required pattern
    check(name, "Invalid parameter name").len(6, 10).is(regular_expressions.username);

    // checks if the provided password matches the required pattern
    check(pass, "Invalid parameter pass").len(6, 11).is(regular_expressions.password);
}

/**
 * Reports the ranking with the specified characteristics.
 * 
 * @param res         The server response
 * @param path_name   The path name
 * @param query       The parsed query
 */
function ranking(res, path_name, query)
{
    try
    {
        var validation = validateQuery(res, path_name, query);

        if (validation == true)
        {
            _ranking(res, query);
        }
    }
    catch (error)
    {
        res.end(JSON.stringify({ "error": error }));
    }
}

/**
 * Sends the questions for each game.
 * 
 * @param res         The server response
 * @param path_name   The path name
 * @param query       The parsed query
 */
function questions(res, path_name, query)
{
    try
    {
        var validation = validateQuery(res, path_name, query);

        if (validation == true)
        {
            _questions(res, query);
        }
    }
    catch (error)
    {
        res.end(JSON.stringify({ "error": error }));
    }
}

/**
 * Joins a player to a game.
 * 
 * @param res         The server response
 * @param path_name   The path name
 * @param query       The parsed query
 */
function join(res, path_name, query)
{
    try
    {
        var validation = validateQuery(res, path_name, query);

        if (validation == true)
        {
            _join(res, query);
        }
    }
    catch (error)
    {
        res.end(JSON.stringify({ "error": error }));
    }
}

/**
 * Leaves player from waiting for an opponent
 * 
 * @param res         The server response
 * @param path_name   The path name
 * @param query       The parsed query
 */
function leave(res, path_name, query)
{
    try
    {
        var validation = validateQuery(res, path_name, query);

        if (validation == true)
        {
            _leave(res, query);
        }
    }
    catch (error)
    {
        res.end(JSON.stringify({ "error": error }));
    }
}


/**
 * Notifies a player when a valid play occorred.
 * 
 * @param res         The server response
 * @param path_name   The path name
 * @param query       The parsed query
 */
function notify(res, path_name, query)
{
    try
    {
        var validation = validateQuery(res, path_name, query);

        if (validation == true)
        {
            _notify(res, query);
        }
    }
    catch (error)
    {
        res.end(JSON.stringify({ "error": error }));
    }
}

/**
 * Handles updates. 
 * 
 * @param res         The server response
 * @param path_name   The path name
 * @param query       The parsed query
 */
function update(res, path_name, query)
{
    try
    {
        var validation = validateQuery(res, path_name, query);

        if (validation == true)
        {
            _update(res, query);
        }
    }
    catch (error)
    {
        res.end(JSON.stringify({ "error": error }));
    }
}

/**
 * Handles registrarion process.
 *
 * @param path_name   The path name
 * @param query       The parsed query
 */
function _registration(res, query)
{
    pool.getConnection(function (err, connection)
    {
        // Prevents SQL injections
        connection.query("SELECT name, pass, salt FROM Users WHERE name=?",
                         [query.name],
                         function (err, rows)
                         {
                             if (rows.length == 0)      // Create a new username
                             {
                                 // Generate random string to use as salt
                                 var encrypted_pass = encryptPassword(query.pass);

                                 // Prevents SQL injections
                                 connection.query('INSERT INTO Users VALUES (?,?,?)',
                                                  [query.name, encrypted_pass, random_string],
                                                  function (err, result)
                                                  {
                                                      if (err)
                                                          connection.rollback(function () { throw err; });
                                                      else
                                                          res.end(JSON.stringify({}));
                                                  });
                             }
                             else
                             {
                                 var salt = rows[0].salt;
                                 var new_pass = comparePassword(query.pass, salt);

                                 if (new_pass != rows[0].pass)
                                 {
                                     res.end(JSON.stringify({"error": "User " + query.name +
                                         " is already registered with a different password."
                                     }));
                                 }
                                 else
                                     res.end(JSON.stringify({}));
                             }

                             // return connection to the pool
                             connection.release();
                         });
    });
}

/**
 * Handles ranking process.
 *
 * @param path_name   The path name
 * @param query       The parsed query
 */
function _ranking(res, query)
{
    var type = query.type;
    var size = query.size;

    validateParams(query);

    pool.getConnection(function (err, connection)
    {
        // Prevents SQL injections
        connection.query("SELECT name, score FROM Rankings WHERE gametype=? and boardsize=? ORDER BY score DESC LIMIT 10",
                         [type, size],
                         function (err, rows)
                         {
                             res.end(JSON.stringify({ "ranking": rows }));

                             // return connection to the pool
                             connection.release();
                         });
    });
}

/**
 * Handles questions process.
 *
 * @param path_name   The path name
 * @param query       The parsed query
 */
function _questions(res, query)
{
    var type = query.type;
    var size = query.size;

    validateParams(query);

    var first_letter = type.charAt(0).toUpperCase(); 
    type = type.substring(1, type.length);
    type = first_letter + type;

    if (type == 'Arithmetic')
    {
        var questions = generateArithmeticQuestions(parseInt(size) + 2);

        res.end(JSON.stringify({ "questions": questions }));
    }
    else
    {
        pool.getConnection(function (err, connection)
        {
            // Prevents SQL injections
            connection.query("SELECT COUNT(*) AS count FROM ??",
                             [type],
                             function (err, rows)
                             {
                                 var number_questions = rows[0].count;    // Number of rows
                                 var ids = generateRandomIds(parseInt(size) + 2, number_questions);

                                 connection.query("SELECT question, answer FROM ?? WHERE id  IN " + ids,
                                                   [type],
                                                   function (err, rows)
                                                   {
                                                       res.end(JSON.stringify({ "questions": rows }));

                                                       // return connection to the pool
                                                       connection.release();
                                                   });
                             });
        });
    }
}

/**
 * Gets questions for the multiplayer game.
 *
 * @param game  id of the game
 */
function getMultiplayerQuestions(game)
{
    var type = games_running[game].type;
    var size = parseInt(games_running[game].size);
   
    var letter = type.charAt(0).toUpperCase();
    type = letter + type.substring(1);

    sendSSE(game); // sends scores

    if (type == 'Arithmetic')
    {
        var questions = generateArithmeticQuestions(parseInt(size) + 2);

        data[game] = { "questions": questions };
        sendSSE(game);                          //sends questions
        startCountdown(game);
    }
    else
    {
        pool.getConnection(function (err, connection)
        {
            // Prevents SQL injections
            connection.query("SELECT COUNT(*) AS count FROM ??",
                             [type],
                             function (err, rows)
                             {
                                 var number_questions = rows[0].count;    // Number of rows
                                 var ids = generateRandomIds(parseInt(size) + 2, number_questions);

                                 connection.query("SELECT question, answer FROM ?? WHERE id  IN " + ids,
                                                   [type], 
                                                   function (err, rows)
                                                   {                                                      
                                                       data[game] = { "questions": rows };      //update
                                                       sendSSE(game);                           //sends questions
                                                       startCountdown(game);

                                                       // return connection to the pool
                                                       connection.release();
                                                   });
                             });
        });
    }
}

/**
 * Handles join process.
 *
 * @param path_name   The path name
 * @param query       The parsed query
 */
function _join(res, query)
{
    var name = query.name;
    var pass = query.pass;
    var type = query.type;
    var size = query.size;

    validateParams(query);

    var error = false;

    pool.getConnection(function (err, connection)
    {
        // Prevents SQL injections
        connection.query("SELECT name, pass, salt FROM Users WHERE name=?",
                         [query.name],
                         function (err, rows)
                         {
                             error = authentication(res, rows, query);    // verifies the authentication of the player                        

                             if (!error)    // authentication succeded
                             {
                                 var found = false;

                                 for (var i = 0; i < waiting_games.length; i++)
                                 {
                                     if (waiting_games[i].type === type && waiting_games[i].size === size) //exists a game in wait for the type and size specified
                                     {
                                         found      = true;
                                         game       = waiting_games[i].game;
                                         key        = generateKey();
                                         
                                         var player = new Player(name, key);

                                         createNewGame(i, size, player, type, res);

                                         res.end(JSON.stringify({ 'game': game, 'key': key }));
                                        
                                         waiting_games = resetGamesArrays(i, waiting_games);
                                     }
                                 }

                                 if (!found)    // wait for another player
                                 {
                                     key        = generateKey();
                                     var player = new Player(name, key);

                                     createNewWaitingGame(player,type,size);

                                     res.end(JSON.stringify({ 'game': game_id, 'key': key }));
                                     game_id++;
                                 }
                             }

                             // return connection to the pool
                             connection.release();
                         });
    });
}

   /**
    * Verifies if the name and data of the player corresponds with the registration data
    *
    * @param res        The server object response
    * @param rows       Rows read from the database
    * @param query      Query given by the client
    * @return error     Authentication valid or invalid
    */
function authentication(res, rows, query)
{
    if (rows.length == 0)
    {
          res.end(JSON.stringify({ 'error': "Authentication error" }));
          return true;
    }
    else
    {
        var salt = rows[0].salt;
        var new_pass = comparePassword(query.pass, salt);

        if (new_pass != rows[0].pass)
        {
            res.end(JSON.stringify({ 'error': "Authentication error" }));
            return true;
        }
    }

    return false;
}


   /**
    *   Creates a new game in waiting state
    *
    * @param player         player waiting for an oponnet
    * @param type           type of the game
    * @param size          size of the game
    */
function createNewWaitingGame(player, type, size)
{
    var game_players = new Object();
    var scores       = new Object();
    
    game_players = [player];
    players[game_id] = game_players;

    waiting_games[waiting_games.length] =
    {
        'type'        : type,
        'size'        : size,
        'game'        : game_id,
        'first_player': player
    };
        
    scores[player.name] = 0;
    data[game_id] = { 'scores': scores };      //update
}

   /**
    * Creates a new game
    * 
    * @param i      position of the game in the array of waiting games
    * @param size   size of the table
    * @param name   name of the last player to join the game
    * @param type   type of game
    */
function createNewGame(i, size, player, type, res)
{
    var timestamp    = new Object();
    var scores       = new Object();
    var game_players = new Object();
    var time         = Date.now();

    user = waiting_games[i].first_player;
    game = waiting_games[i].game;

    number_cells = (parseInt(size) + 2) * (parseInt(size) + 2);

    table = generateGame(parseInt(size) + 2); //creates a table that include all the cells of the game

    scores[user.name]   = 0;
    scores[player.name] = 0;

    data[game] = { 'scores': scores }; //update

    timestamp[player.name] = time;  //timestamp of each player
    timestamp[user.name]   = time;

    game_players  = [user,player];
    players[game] = game_players;

    games_running[game] =
    {
        'scores': scores,
        'cells': table,
        'number_cells': number_cells,
        'gameInstant': timestamp,
        'type': type,
        'size': size,
    };
}

/**
 * Handles leave process.
 *
 * @param path_name   The path name
 * @param query       The parsed query
 */
function _leave(res, query)
{
    var name = query.name;
    var key  = query.key;
    var game = query.game;

    validateParams(query);

    var found = false;

    //verifies if the game hasn't started yet
    for (var i = 0 ; i < waiting_games.length; i++)
    { 
        if(waiting_games[i].game == game)
            found = true;
    }
        
    if (!found)
        res.end(JSON.stringify({ 'error': " Can't leave when game is in ready state" }));
    else
    {
        for (var i = 0; i < waiting_games.length; i++)
        {
            var player = waiting_games[i].first_player;

            if (player.key == key && player.name == name && waiting_games[i].game == game)
            {
                waiting_games = resetGamesArrays(i, waiting_games);

                res.end(JSON.stringify({}));
            }
        }
    }
    
}

/**
 * Handles notify process.
 *
 * @param path_name   The path name
 * @param query       The parsed query
 */
function _notify(res, query)
{
   
    var name = query.name
    var key  = query.key
    var game = query.game
    var row  = query.row;
    var col  = query.col;

    validateParams(query);

    var table_game = games_running[game].cells;
    var cells      = games_running[game].number_cells;

    row = parseInt(row) - 1;
    col = parseInt(col) - 1;
    
    var game_players = players[game];

    for (var i = 0; i < game_players.length; i++)
    {
        var player = game_players[i];

        if(player.name === name)
        {           
            if (player.key != key)
                    res.end(JSON.stringify({ 'error': 'Identificador de jogo inexistente' }));
            else
            {
                if (table_game[row][col] == 1) //cell hasn't been removed yet
                {
                    cells--; //decrement the number of cells that hasn't been answered yet
                    games_running[game].number_cells = cells;

                    table_game[row][col] = 0; //sets the cell in position (row,cell) as removed
                    games_running[game].cells = table_game;

                    setPoints(name, game); //updates player's points

                    data[game] = {
                        'move': {
                            'name': name, 
                            'row': (row + 1),
                            'col': (col + 1)
                        }, 'scores': games_running[game].scores
                    };  //update data for server sent-event

                    sendSSE(game); //update
                    res.end(JSON.stringify({}));
                }
                else
                    res.end(JSON.stringify({ 'error': ("Ladrilho " + (row + 1) + "," + (col + 1) + " já removido") }));

                if (cells == 0) //report winner and update ranking
                {
                    winner = findWinner(name, game);
                    data[game] = {
                        'move': {
                            'name': name, 
                            'row': (row + 1),
                            'col': (col + 1)
                        }, 
                        'scores': games_running[game].scores, 
                        'winner': winner
                    };

                    sendSSE(game);  //update
                    updateRanking(game, winner); //adds winner to the ranking
                }
            }
        }
    }
}

/**
 * Adds the winner of the game to the ranking
 *
 * @param game       id of the game
 * @param winner     name of the winner 
 */
function updateRanking(game, winner)
{
    pool.getConnection(function (err, connection)
    {
        connection.query('INSERT INTO Rankings VALUES (?,?,?,?,?)',
                         [games_running[game].type,
                         games_running[game].size,
                         winner,
                         games_running[game].scores[winner],
                         games_running[game].gameInstant[winner]],
                         function (err, result)
                         {
                             if (err)
                                 connection.rollback(function () { throw err; });
                             else
                             {
                                 res.end(JSON.stringify({}));

                                 games_running = resetGamesArrays(game, games_running);
                             }

                             // return connection to the pool
                             connection.release();
                         });
    });
}

/**
 * Handles update process.
 *
 * @param path_name   The path name
 * @param query       The parsed query
 */
function _update(res, query)
{
    var name = query.name;
    var key  = query.key
    var game = query.game;

    var game_players = players[game];
      
     for(var i = 0; i < game_players.length; i++){

        var player = game_players[i];
        if(player.name == name){

            if (player.key!= key){

                res.end(JSON.stringify({ 'error': 'Identificador de jogo inexistente' }));
                }
            else
            {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream; charset=utf-8',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*'
                });

                clients[name] = res;
                firstUpdate(game);
            }
        }
   }
}

/**
 * Manages the first update request from both players
 *
 * @param res     response object of the client
 * @param game    id of the game
 */
function firstUpdate(game)
{
    if (data[game].hasOwnProperty('scores'))
    {
        var players = 0;

        for (player in data[game].scores)
            if (clients.hasOwnProperty(player))
                players++;

        // if both players are ready, send questions and start countdown   
        if (players == 2)
            getMultiplayerQuestions(game);
        else
            sendSSE(game);
    }
}

/**
 * Sends response for the client has a server sent-event
 *
 * @param game    id of the game
 */
function sendSSE(game)
{
    var game_players = players[game];
    
    for (var i = 0; i < game_players.length; i++)
    {
       var player = game_players[i];

        if (clients.hasOwnProperty(player.name))     //checks if the player already made an update request
        {
            res = clients[player.name];
            res.write("data: " + JSON.stringify(data[game]) + "\n\n");

            if (data[game].hasOwnProperty('winner')) // deletes the response objects of the players and ends server sent-event
            {
                delete (clients[player.name]);
                delete(players[game]);
                res.end();
            }
        }
    }
}

/**
 * Starts countdown
 *
 * @param game   id of the game
 */
function startCountdown(game)
{
    time = 5;
    countdownInterval = setInterval(function ()
    {
        data[game] = { 'countdown': time };
        sendSSE(game);
        
        if (time < 1)
        {
            clearInterval(countdownInterval);
        } 
        time--;
    }, 1000);
}

/**
 * Detemines who is the winner of the specified game
 *
 * @param name    name of the player who did the last move
 * @param game    id of the game   
 */
function findWinner(name, game)
{
    var winner     = name;
    var max_points = games_running[game].scores[name]; //score of the player who made the last move
    var scores     = games_running[game].scores;      //scores of all players

    for (player in scores)
    {
        if (scores.hasOwnProperty(player))
        {
            if (player != name)
            {
                if (scores[player] == max_points || scores[player] > max_points)
                    return player;    // the winner is the oponnent of the player who made the last move
            }
        }
    }

    return winner; //the winner is the player who made the last move
}

/**
 * Generates a table to control the removed cells in each game
 *
 * @param size   size of the table
 * @return table  table of the cells
 */
function generateGame(size)
{
    var table = new Array(size);

    for (var i = 0; i < size; i++)
    {
        table[i] = new Array(size);
    }

    for (var i = 0; i < size; i++)
    {
        for (var j = 0; j < size; j++)
        {
            table[i][j] = 1;
        }
    }

    return table;
}
    
/**
 * Removes the element from the Array
 * 
 * @param pos position to remove  
 * @return array  new array 
 */
function resetGamesArrays(pos, array)
{
    array.splice(pos, 1);

    return array;
}

/**
 * Generates a string that contains the id's of the questions
 *
 * @param size                The require array size
 * @param number_questions    The number of questions 
 * @return string             string with questions' ids  
 */
function generateRandomIds(size, number_questions)
{
    var array = [];
    var string = "(";

    size *= size;

    while (array.length < size)
    {
        var random_number = generateRandomNumber(number_questions);
        var found = false;

        for (var i = 0; i < size; i++)
        {
            if (array[i] == random_number)
            {
                found = true;
                break;
            }
        }

        if (!found)
        {
            array[array.length] = random_number;

            if (array.length == size)
                string = string + random_number;
            else
                string = string + random_number + ", ";
        }
    }

    string = string + ")";

    return string;
}

/**
 * Generates questions for the arithmetic type
 *
 * @param size     size of the table
 */
function generateArithmeticQuestions(size)
{
    var number_cells = size * size;
    var answers      = [];
    var questions    = [];

    while (answers.length < number_cells)
    {
        var x  = generateRandomNumber(10);
        var y  = generateRandomNumber(10);
        var op = generateOp();        
        var answer;
        var question;

        if (op === '-') 
        {
            answer   = x + y;
            question = answer + " - " + y; 
        } else if (op === '/')
        {
            answer   = x * y;
            question = answer + " / " + y;
        } else       // + or *
            question = x + " " + op + " " + y;

        answer = calculateResult(x, op, y);
        
        var found = false;

        for (var i = 0; i < answers.length; i++)
        {
            if (answers[i] == answer)
            {
                found = true;
                break;
            }
        }

        if (!found)
        {
            answers[answers.length] = answer;
            questions[questions.length] = { 'question': question, 'answer': answer.toString() };
        }
    }

    return questions;
}

/**
 * Generates a random arithmetic operation
 *
 * @returns the operation
 */
function generateOp()
{
    var ops = ['+', '-', '*', '/'];
    var op  = ops[Math.floor(Math.random() * ops.length)];

    return op;
}

/**
* Calculate the result of thte arithmetic operation
* 
* @param num1      First number
* @param op        Arithmetic operation
* @param num2      Second number
*/
function calculateResult(num1, op, num2)
{
    if (op === '+')
    {
        return (num1 + num2);

    } else if (op === '-')
    {
        return num1;

    } else if (op === '/')
    {
        return num1;

    } else
    {
        return (num1 * num2);
    }
}

function generateRandomNumber(limit)
{
    return Math.floor((Math.random() * limit) + 1);
}

/**
 * Validates the parameters of the given function.
 * 
 * @type  bool
 * @param path_name   The function to query
 * @param query       The query's parameters
 */
function validateQuery(res, path_name, query)
{
    var parameters = web_resources[path_name];

    for (param in parameters)
    {
        if (!query.hasOwnProperty(parameters[param]))
        {
            throw ("Parameter " + parameters[param] + " absent.");

            return false;
        }
    }

    return true;
}

/**
 * Validates parameters' value
 *
 * @param query  The query's parameters
 */
function validateParams(query)
{
    for (param in query)
    {
        if (query.hasOwnProperty(param))
        {
            switch (param)
            {
                case 'name':
                    if (!regular_expressions.username.test(query.name))
                        throw "Invalid parameter name";
                    break;
                case 'pass':
                    if (!regular_expressions.password.test(query.pass))
                        throw "Invalid parameter pass";
                    break;
                case 'key':
                    if (!regular_expressions.key.test(query.key))
                        throw "Invalid parameter key";
                    break;
                case 'game':
                    if (!regular_expressions.game.test(query.game))
                        throw "Invalid parameter game";
                    break;
                case 'type':
                    if (!regular_expressions.type.test(query.type))
                        throw "Invalid parameter type";
                    break;
                case 'size':
                    if (!regular_expressions.size.test(query.size))
                        throw "Invalid parameter size";
                    break;
                case 'row':
                    if (!regular_expressions.row.test(query.row))
                        throw "Invalid parameter row";
                    break;
                case 'col':
                    if (!regular_expressions.col.test(query.col))
                        throw "Invalid parameter col";
                    break;
                default:
                    throw "Error";
            }
        }
    }
}

/**
 * Encrypts user's password.
 *
 * @type   String
 * @return pass     The encrypted string
 */
function encryptPassword(pass)
{
    pass = generateRandomString() + pass;
    pass = crypto.createHash('md5').update(pass).digest('hex');

    return pass;
}

/**
 * Compares provided password with user's password.
 *
 * @type   String
 * @return pass     The encrypted string
 */
function comparePassword(pass, salt)
{
    pass = salt + pass;
    pass = crypto.createHash('md5').update(pass).digest('hex');

    return pass;
}

/**
 * Generates a random string to use as salt.
 * 
 * @type   String
 * @return random_string   The string randomly generated
 */
function generateRandomString()
{
    // Instantiate Chance so it can be used
    chance = new Chance();

    random_string = chance.string({ length: 4 });

    return random_string;
}

/**
 * Generates a key foreach game.
 * 
 * @return key     The encrypted key
 */
function generateKey()
{
    key = "" + Math.floor((Math.random() * 10000) + 1); 
    key = crypto.createHash('md5').update(key).digest('hex');

    return key;
}

/**
 * Sets the points of the player
 *
 * @param player      name of the player
 * @param game        id of the game   
 */
function setPoints(player, game)
{
    var timeInstant   = games_running[game].gameInstant[player];
    var timeNow       = Date.now();
    var timeVariation = Math.floor(timeNow - timeInstant);
    var time          = timeVariation / 10000;

    games_running[game].scores[player] += Math.floor(1000 * Math.exp(-time));

    games_running[game].gameInstant[player] = timeNow;
}

server.listen(port);