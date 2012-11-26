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
	async = require("async");

var DEBUG = true,
	NUM_HISTOGRAM_BINS = 24, // one for each hour...
	NUM_COMMITS_PER_FETCH = 500, // We have to set this carefully, because fetching too much overloads sdout\
	NUM_MAX_FETCHES = 200;

var log = function( text ) {
	if( DEBUG ) console.log( text ) ;
}

var analysisCache = {}, 		// A cache of data that we can hand out without analyzing again
	reposBeingAnalyzed = {},	// A map of the repositories currently being analyzed
	queuedCallbacks = {};		// A map of arrays of callbacks indexed by repo ID string (path or githubUser:repo)


//////////////////////////////////////////////////////////////////////////
// Constructor
gitstats.analyzeLocalGitFile = function( repoPath, branchName, forcePull, callback ) {
	getLocalCommits( repoPath, gitstats.parseCommitInfo, forcePull, callback );
} // end analyzeLocalGitFile()


//////////////////////////////////////////////////////////////////////////
// Opens a local .git file and calls the processCallback with the commits found
function getLocalCommits( repoPath, branchName, forcePull, callback ) {

	// If we don't have to pull, see if we can pull this from the cache
	if( !forcePull ) {
		var cachedCommitInfo = analysisCache[repoPath];

		if( typeof(cachedCommitInfo) != "undefined" ) {
			callback( cachedCommitInfo );
			return;
		}

		// We failed to pull it from the cache. See if we're in the process of 
		// analyzing it already, and push the callback into the queue if we are
		if( typeof(reposBeingAnalyzed[repoPath]) != "undefined" ) {
			if( typeof(queuedCallbacks[repoPath]) == "undefined" ) {
				queuedCallbacks[repoPath] = [];
			}

			queuedCallbacks[repoPath].push( callback );

			return;
		}
	}

	// We are about to analyze this file, and we record that
	// so that any requests that happen during the analysis can
	// be handled appropriately
	reposBeingAnalyzed[repoPath] = "lol";

	var stopFetching = false,
		iBatch = 0;

	var repo = git( repoPath ),
		analysisData;

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

			repo.commits( branchName, NUM_COMMITS_PER_FETCH, iBatch * NUM_COMMITS_PER_FETCH, function( err, commits ) {
				if( err != null && typeof(err) != "undefined" ) {
					console.log("Error getting repo: " + err);
					return;
				}

				parseCommits( commits, function( analysisData, isFinished ) {
					if( isFinished )
						stopFetching = true;

					analysisData = analysisData;
					iBatch++;
					onError();
				});
			});
		},
		function (err) {
			if( typeof(err) == "undefined" ) {
				console.log("Finished!");

				// If we have any queued callbacks for this repo, call them
				if( typeof(queuedCallbacks[repoPath]) != "undefined" ) {
					var callbacks = queuedCallbacks[repoPath];

					for( var iCallback = 0; iCallback < callbacks.length; ++iCallback ) {
						callbacks[iCallback]( analysisData );
					} // end for each callback

					// Delete the callbacks
					delete queuedCallbacks[repoPath];
				} // end if we have some callbacks

				// Delete records of us doing analysis for this repo
				delete reposBeingAnalyzed[repoPath];

				// Call the callback from the user who originally kicked off
				// analysis for this repo
				callback( analysisData );
			} else {
				console.log( err );
			}
		}
	);
} // getLocalCommits()


//////////////////////////////////////////////////////////////////////////
// Parses a set of commit infos 
function parseCommits( commits, callback ) {
	var committerInfo = {},
		isFinished = false;

	// Setup a user that will represent the entire repository
	var globalUser = {
		name: "all",
		email: "commits",
		numCommits: 0,
		commitTimes: []
	};
	
	// Loop through all of the commits in this repository
	for( var iCommit in commits ) {
		var thisCommit = commits[iCommit];
		
		var author = thisCommit.author,
			time = thisCommit.committed_date;
		
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

	// If we haven't processed any commits, we should stop trying to fetch data
	// because we're not going to get anything else from this repo
	if( Object.keys(commits).length == 0 ) {
		console.log( "finished" );
		isFinished = true;
		committerInfo["all:commits"] = globalUser;
	}

	callback( committerInfo, isFinished );
} // parseCommits()


function onError( error ) {
	console.log( "Error: " + error );
}