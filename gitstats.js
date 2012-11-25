//////////////////////////////////////////////////////////////////////////
// GitStats - Server Side
//////////////////////////////////////////////////////////////////////////
//
// Main module for gitstats
//
/* ----------------------------------------------------------------------
                                                    Object Structures
-------------------------------------------------------------------------

*/
//////////////////////////////////////////////////////////////////////////
// Node.js Exports
var gitstats = exports;


//////////////////////////////////////////////////////////////////////////
// Namespace (lol)
var git = require("gift"),
	async = require("async"),
	io = require('socket.io').listen(9002);

var DEBUG = true,
	NUM_HISTOGRAM_BINS = 24, // one for each hour...
	NUM_COMMITS_PER_FETCH = 500, // We have to set this carefully, because fetching too much overloads sdout\
	NUM_MAX_FETCHES = 200;

var log = function( text ) {
	if( DEBUG ) console.log( text ) ;
}


//////////////////////////////////////////////////////////////////////////
// Constructor
gitstats.analyzeLocalGitFile = function( path ) {
	getLocalCommits( path, parseCommitInfo );
} // end analyzeLocalGitFile()


//////////////////////////////////////////////////////////////////////////
// Opens a local .git file and calls the processCallback with the commits found
function getLocalCommits( branchName, numCommits, startCommit, callback ) {
	var stopFetching = false;

	async.whilst(
		function () { 
			if( !stopFetching ) {
				return iBatch < NUM_MAX_FETCHES; 
			} else {
				return false;
			}
		},
		function( onError ) {
			console.log( "Did fetch " + iBatch );
			getCommitInfos( "master", NUM_COMMITS_PER_FETCH, iBatch * NUM_COMMITS_PER_FETCH, function() {			
				iBatch++;
				onError();
			});
		},
		function (err) {
			if( typeof(err) == "undefined" ) {
				console.log("Finished!");
			} else {
				console.log( err );
			}
		}
	);
} // getLocalCommits()


//////////////////////////////////////////////////////////////////////////
// Parses a set of commit infos 
function parseCommits( commits, callback ) {
	if( err != null && typeof(err) != "undefined" ) {
		console.log(err);
		stopFetching = true;
	}

	var count = 0;
	
	// Loop through all of the commits in this repository
	for( var iCommit in commits ) {
		count++;

		var thisCommit = commits[iCommit];
		
		var author = thisCommit.author,
			time = thisCommit.committed_date;

		//console.log( time );
		
		// We record user string identifiers as commitName:email
		var userString = thisCommit.author.name + ":" + thisCommit.author.email;

		var userEntry = committerInfo[userString];
		
		// If we've never seen this user before, make a new info entry for them
		if( typeof(userEntry) == "undefined" || userEntry == null ) {
		
			userEntry = {
				name: author.name,
				email: author.email,
				numCommits: 0,
				commitTimes: []
			}
		}
		
		// Update this user's commit history
		userEntry.commitTimes.push( time );
		globalUser.commitTimes.push( time );
		userEntry.numCommits++;
		
		// Push this user back into the map
		committerInfo[userString] = userEntry;
	} // end for each commit	

	if( count > 0 ) {
		count = 0;
	} else {
		stopFetching = true;
		committerInfo["all:commits"] = globalUser;
	}

	callback();
} // parseCommits()


function onError( error ) {
	console.log( "Error: " + error );
}