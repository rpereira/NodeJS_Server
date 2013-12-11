// required modules
var http  = require('http');
var url   = require('url');
var mysql = require('mysql'); 

var port = process.env.port || 8000;

// Constants
var SERVICE_URL     = 'www.http://twserver.alunos.dcc.fc.up.pt/';

//  Hash table with all implemented resources
var web_resources = 
{
    'register' : [ 'name', 'pass' ],
    'ranking'  : [ 'type', 'size' ]
};

// Associative array to validate user' info
var regular_expressions =
{
    'username' : /^\w{4,14}/,     // allow only letters, numbers and '_'
    'password' : /^\w{4,14}/      // allow only letters, numbers and '_'
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
 * Handles login process.  
 *
 * @param res     The server response
 * @param query   Client's query
 */
function login(res, query)
{
    var name = query.name;

    // checks if provided username matches the required pattern
    if(!regular_expressions.username.test(name))
        throw "Invalid parameter name";

    var pass = query.pass;

    // checks if provided password matches the required pattern
    if(!regular_expressions.password.test(pass))
        throw "Invalid parameter pass";

    //var rows = res.rows;

    // fazer pesquisa
    // ...

    // Creates new user
    /*if(res.rows == 0)
    {
        res.end(JSON.stringify( { } ));
    }
    else if(res.rows != 1)
    {
        res.end(JSON.stringify( { "error":"" } ));
    }*/
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
            login(res, query);
        }
    }
    catch(error)
    {
        res.end(JSON.stringify( { "error":error } ));
    }

    //connection.connect();

    // Relational database connection
    /*pool.getConnection(function(err, connection)
    {
        connection.query('SELECT * FROM Users', function(err, rows)
        {
            // return connection to the pool
            connection.release();   
        });
    });*/

    // se nao existir, insere na tabela
    // se existir, verificar se a pass ta correcta
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
    }
    catch(error)
    {
        res.end(JSON.stringify( { "error":error } ));
    }
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
            throw "Parameter " + parameters[param] + " absent.";

            return false;
        }
    }
    
    return true;    
}

/** 
 * Server module
 */
var server = http.createServer(function (req, res) 
{
    res.writeHead(200, { 'Content-Type': 'application/json' });

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
        res.end(JSON.stringify( { "error":error } ));
    }
    
    res.end(req.url);
});

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
        default:
            throw "Unknown function " + path_name;
            break;
    }
}

server.listen(port);