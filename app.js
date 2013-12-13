// required modules
var http   = require('http');
var url    = require('url');
var mysql  = require('mysql');
var Chance = require('chance');
var crypto = require('crypto');

var port = process.env.port || 8026;

//  Hash table with all implemented resources
var web_resources = 
{
    'register'  : [ 'name', 'pass' ],
    'ranking'   : [ 'type', 'size' ],
    'questions' : [ 'type', 'size' ]
};

// Associative array to validate user' info
var regular_expressions =
{
    'username' : /^\w+$/,      // allow only letters, numbers and '_'
    'password' : /./,          // requires at least one character
    'key'      : /^.{1,32}/,   // allow a sequence of 32 hexadecimal digits
    'type'     : /^/,               // -----------------------------------------------------------------------------------------------------------------------
    'size'     : /^[1-3]/,     // allow one digit in the range [1,3]
    'row'      : /^[1-5]/,     // allow one digit in the range [1,5]
    'col'      : /^[1-5]/      // allow one digit in the range [1,5]
};

// Relational database connection' parameters
var pool = mysql.createPool(
{
    host            : 'localhost',
    user            : 'up201103890',
    password        : 'superbatata', 
    database        : 'up201103890', 
    connectionLimit : 25            // max pool connections
});

/** 
 * Server module
 */
var server = http.createServer(function (req, res) 
{
    // Headers
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin' : '*' });

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
    catch(error)
    {
        res.end(JSON.stringify( { "error" : error } ));
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
    switch(path_name)
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
        if(validation == true)
        {            
            login(query);
            registrationHandler(res, query);
        }
    }
    catch(error)
    {
        res.end(JSON.stringify( { "error" : error } ));
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

    // checks if the provided username matches the required pattern
    if(!regular_expressions.username.test(name))
        throw "Invalid parameter name";

    var pass = query.pass;

    // checks if the provided password matches the required pattern
    if(!regular_expressions.password.test(pass))
        throw "Invalid parameter pass";
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

        if(validation == true)
        {
            rankingHandler(res, query);
        }
    }
    catch(error)
    {
        res.end(JSON.stringify( { "error" : error } ));
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

        if(validation == true)
        {
            questionsHandler(res, query);
        }
    }
    catch(error)
    {
        res.end(JSON.stringify( { "error" : error } ));
    }
 }

/**
 * Handles registrarion process.
 *
 * @param path_name   The path name
 * @param query       The parsed query
 */
function registrationHandler(res, query)
{
    pool.getConnection(function(err, connection)
    {
        // Prevents SQL injections
        connection.query("SELECT name, pass, salt FROM Users WHERE name=?", [query.name], function(err, rows)
        {
            if(rows.length == 0)      // Create a new username
            {
                // Generate random string to use as salt
                var encrypted_pass = encryptPassword(query.pass);

                // Prevents SQL injections
                connection.query('INSERT INTO Users VALUES (?,?,?)',
                                 [query.name, encrypted_pass, random_string],
                                 function(err, result)
                {
                    if(err)
                    {
                        connection.rollback(function() { throw err; });
                    }
                });
            }
            else
            {
                var salt = rows[0].salt;
                var new_pass = decryptPassword(query.pass, salt);

                if(new_pass != rows[0].pass)
                {
                    res.end(JSON.stringify( { "error" : "User " + query.name +
                                              " is already registered with a different password." } ));
                }
                else
                {
                    res.end(JSON.stringify( { } ));
                }
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
 */
function rankingHandler(res, query)
{
    var type = query.type;

    // checks if the provided type matches the required pattern
    if(!regular_expressions.type.test(type))
        throw "Invalid parameter type";

    var size = query.size;

    // checks if the provided size matches the required pattern
    if(!regular_expressions.size.test(size))
        throw "Invalid parameter size";

    pool.getConnection(function(err, connection)
    {
        // Prevents SQL injections
        connection.query("SELECT name, score FROM Rankings WHERE gametype=? and boardsize=? ORDER BY score DESC LIMIT 10",
                         [type, size], function(err, rows)
        {
            res.end(JSON.stringify( { "ranking" : rows } ));

            // return connection to the pool
            connection.release();
        });
    });
}

/**
 * Handles ranking process.
 *
 * @param path_name   The path name
 */
function questionsHandler(res, query)
{
    var type = query.type;

    // checks if the provided type matches the required pattern
    if(!regular_expressions.type.test(type))
        throw "Invalid parameter type";

    var size = query.size;

    // checks if the provided size matches the required pattern
    if(!regular_expressions.size.test(size))
        throw "Invalid parameter size";

    pool.getConnection(function(err, connection)
    {
        // Prevents SQL injections
        connection.query("SELECT COUNT(*) AS count FROM ??", //confirmar com Prof Prior ----------------------------------------------
                         [type], function(err, rows)
        {
            var number_questions = rows[0].count;           // Number of rows

            var array = new Array(size * size);

            // generate random numbers
            for(var i = 0; i < 25; i++)
            {
                array[i] = generateRandomNumber(number_questions);

                connection.query("SELECT question, answer FROM ?? WHERE id = ?",
                                 [type, array[i]],
                                 function(err, rows)
                {
                    array[i] = JSON.stringify( { 'question' : rows[0].question, 'answer' : rows[0].answer } );
                   console.log("2: " + array[i]);
                });
            }

            console.log("2: ");
            res.end(JSON.stringify( { "questions" :  array } ));
            console.log("3");

            // return connection to the pool
            connection.release();
        });
    });
}

/**
 * Generates an array filled with distinct random numbers.
 *
 * @param size                The require array size
 * @param number_questions    The number of questions ---------------------------
 */
function generateRandomNumbers(size, number_questions)
{
    var array = [];

    size *= size;

    while(array.length < size)
    {
        var random_number = generateRandomNumber(number_questions);
        var found         = false;

        for(var i = 0; i < size; i++)
        {
            if(array[i] == random_number)
            {
                found = true;
                break;
            }
        }

        if(!found)
            array[array.length] = random_number;
    }
}

/**
 * Generates a random number in the range [1, number_questions]
 *
 * @param number_questions
 */
function generateRandomNumber(number_questions)
{
    return Math.floor((Math.random() * number_questions) + 1);
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
   
    for(param in parameters)
    {
        if(!query.hasOwnProperty(parameters[param]))
        {
            throw ("Parameter " + parameters[param] + " absent.");

            return false;
        }
    }
    
    return true;
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

    random_string = chance.string ( { length : 4 } );

    return random_string;
}

server.listen(port);