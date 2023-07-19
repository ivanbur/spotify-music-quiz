const NUM_SONGS = 5;
const CLIP_LENGTH = 8;
const START_SCORE = 1000;

const GENERIC_ERROR = -3;
const UNAUTHORIZED = -2;
const REFRESH_UNSUCCESSFUL = -1;
const REFRESH_SUCCESSFUL = 0;
const NO_ERROR = 1;

// used for storing all information
let allPlaylists;
// used for resetting currentSongs
let allSongs;
// used for keeping track of which songs are in the game
let currentSongs;
// used for keeping track of which songs were answered incorrectly
let incorrectsongs;
// the intervalID for the timer is stored here
let currentInterval;
// the number of songs to play is stored here
// let songsInMode;
// the indices of the playlists that are being loaded is stored here
let currentIndices;
// the settings for the game
let settings = {
    numsongs: 10,
    songlength: 8
};
// the chart for the end screen
let chart;

/**
 * Obtains parameters from the hash of the URL
 * @return Object
 */
 function getHashParams() {
    let hashParams = {};
    let e, r = /([^&;=]+)=?([^&;]*)/g,
        q = window.location.hash.substring(1);
    while ( e = r.exec(q)) {
        hashParams[e[1]] = decodeURIComponent(e[2]);
    }
    return hashParams;
}

function rand(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

function main() {
    let params = getHashParams();
    let access_token = params.access_token;
    let refresh_token = params.refresh_token;
    let error = params.error;

    if (error) {
        alert('There was an error during the authentication');
        return;
    }

    // if they came from callback, set the tokens and refresh page to remove the url stuff
    if (access_token && refresh_token) {
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        showLoggedin();
        window.location.replace('/');
    } else if (!localStorage.getItem('access_token') || !localStorage.getItem('refresh_token')) {
        showLogin();
        return;
    }

    // if they are logged in then load everything
    if (localStorage.getItem('access_token') && localStorage.getItem('refresh_token')) {
        // if there is something there then redirect to clear it
        if (params.access_token || params.refresh_token || params.error) {
            window.location.replace('/');
        }

        let storedsettings = localStorage.getItem('settings');
        let parsedsettings;
        if (storedsettings && ((parsedsettings = JSON.parse(storedsettings)).numsongs) && parsedsettings.songlength) {
            settings = parsedsettings;
        }

        updateSettingsText();

        showLoggedin();

        getPlaylists();
    }
}

async function errorChecking(response, message) {
    if (response.ok) {
        return new Promise((resolve, reject) => { resolve(NO_ERROR); });
    }

    if (response.status === 403) {
        console.log(await response.text());
        showLoggedin();
        $('#playButton').hide();
        $('body').append('<p>You are not authorized for this application</p>');
        return new Promise((resolve, reject) => { resolve(UNAUTHORIZED); });
    }
    
    if (response.status === 401) {
        let tokenOptions = {
            method: 'GET',
            mode: 'same-origin'
        };
        let tokenResponse = await fetch('/refresh_token?refresh_token=' + localStorage.getItem('refresh_token'), tokenOptions);
        if (!tokenResponse.ok) {
            if (!$('#refreshfailure').length) {
                showLoggedin();
                $('#playButton').hide();
                $('body').append('<p id="refreshfailure">Failed to refresh access token</p>');
            }
            return new Promise((resolve, reject) => { resolve(REFRESH_UNSUCCESSFUL); });
        }

        let token = await tokenResponse.json();
        if (token.error) {
            if (!$('#refreshfailure').length) {
                showLoggedin();
                $('#playButton').hide();
                $('body').append('<p id="refreshfailure">Failed to refresh access token</p>');
            }
            return new Promise((resolve, reject) => { resolve(REFRESH_UNSUCCESSFUL); });
        }
        localStorage.setItem('access_token', token.access_token);
        return new Promise((resolve, reject) => { resolve(REFRESH_SUCCESSFUL); });
    }

    // $('body').append('<p>' + message + '. Error code: ' + response.status + '</p>');
    console.log(message + '. Error code: ' + response.status);

    return new Promise((resolve, reject) => { resolve(GENERIC_ERROR); });
}

async function getPlaylists() {
    let access_token = localStorage.getItem('access_token');

    allPlaylists = [];

    // Push Liked Songs as a playlist but load it after load the songs after loading all of the playlists
    allPlaylists.push({ id: '', name: 'Liked Songs', imageurl: 'https://t.scdn.co/images/3099b3803ad9496896c43f22fe9be8c4.png', totalTracks: 0, tracks: [], owner: 'Username not found'});

    // Load playlists
    let playlistsURL = 'https://api.spotify.com/v1/me/playlists?limit=50';
    let playlistsOptions = {
        method: 'GET',
        mode: 'cors',
        headers: { 'Authorization': 'Bearer ' + access_token }
    };
    let playlistsResponse;
    let playlists;

    do {
        playlistsResponse = await fetch(playlistsURL, playlistsOptions);

        let playlistError = await errorChecking(playlistsResponse, 'Error fetching playlists');
        let attempts = 0;

        while (playlistError === REFRESH_SUCCESSFUL) {
            attempts++;
            if (attempts > 3) {
                break;
            }
            playlistsOptions.headers = { 'Authorization': 'Bearer ' + localStorage.getItem('access_token') };
            playlistsResponse = await fetch(playlistsURL, playlistsOptions);
            playlistError = await errorChecking(playlistsResponse, 'Error fetching playlists');
        }

        if (playlistError === UNAUTHORIZED) {
            return;
        }

        if (playlistError < 0 || attempts > 3) {
            console.log('had to skip 50 playlists');
            playlistsURL = playlists.next;
            continue;
        }

        playlists = await playlistsResponse.json();

        for (let i = 0; i < playlists.items.length; i++) {
            allPlaylists.push({ id: '', name: '', imageurl: '', totalTracks: 0, tracks: [], owner: ''});
            // i + 1 because the first one is Liked Songs
            allPlaylists[allPlaylists.length - 1].id = playlists.items[i].id;
            allPlaylists[allPlaylists.length - 1].name = playlists.items[i].name;
            if (playlists.items[i].images.length !== 0) {
                allPlaylists[allPlaylists.length - 1].imageurl = playlists.items[i].images[0].url;
            }
            allPlaylists[allPlaylists.length - 1].totalTracks = playlists.items[i].tracks.total;
            allPlaylists[allPlaylists.length - 1].owner = playlists.items[i].owner.display_name;
        }

        playlistsURL = playlists.next;
    } while (playlistsURL);

    // Get user's information

    let userURL = 'https://api.spotify.com/v1/me';
    let userOptions = {
        method: 'GET',
        mode: 'cors',
        headers: {'Authorization': 'Bearer ' + access_token }
    };
    let userResponse;
    let user;

    userResponse = await fetch(userURL, userOptions);

    let userError = await errorChecking(userResponse, 'Error fetching user information');
    let attempts = 0;

    while (userError === REFRESH_SUCCESSFUL) {
        attempts++;
        if (attempts > 3) {
            break;
        }
        userOptions.headers = { 'Authorization': 'Bearer ' + localStorage.getItem('access_token') };
        userResponse = await fetch(userURL, userOptions);
        userError = await errorChecking(userResponse, 'Error fetching user information');
    }

    if (userError === UNAUTHORIZED) {
        return;
    }

    if (userError > 0 && attempts <= 3) {
        user = await userResponse.json();
        allPlaylists[0].owner = user.display_name;
    } else {
        console.log('couldn\'t get user information');
    }

    createPlaylists();
}

function createPlaylists() {
    for (let i = 0; i < allPlaylists.length; i++) {
        let button = $('<div id="playlistbutton-' + i + '" class="playlistgroup group">' +
                            '<img class="image portion" src="' + allPlaylists[i].imageurl + '" alt="/images/image_not_found.png" width="300" height="300" />' + 
                            '<div class="words portion">' + 
                                '<span class="title">' + allPlaylists[i].name + '</span>' + 
                                '<span class="author">By ' + allPlaylists[i].owner + '</span>' + 
                            '</div>' + 
                            '<img class="spotifylogo blacklogo logotransition" src="/images/Spotify_Icon_RGB_Black.png" />' +
                            '<img class="spotifylogo whitelogo logotransition" src="/images/Spotify_Icon_RGB_White.png" />' +
                        '</div>');

        button.click(function() { playlistButtonClicked(i) });
        button.prop('data-selected', false);
        $('#playlists').append(button);
    }
}

async function getFromEmbed(track) {
    // the part before is a cors proxy that I made from cors-anywhere so that there is no cors error
    let trackURL =  'https://mysterious-anchorage-28858.herokuapp.com/https://open.spotify.com/embed/track/' + track.track.id;
    let trackOptions = {
        method: 'GET',
        mode: 'cors',
        headers: {
            'Content-Type': 'text/html'
        }
    };

    let trackResponse = await fetch(trackURL, trackOptions);

    let trackError = await errorChecking(trackResponse, 'Error getting track from embed');
    let attempts = 0;

    while (trackError === REFRESH_SUCCESSFUL) {
        attempts++;
        if (attempts > 3) {
            break;
        }
        trackOptions.headers = { 'Authorization': 'Bearer ' + localStorage.getItem('access_token') };
        trackResponse = await fetch(trackURL, trackOptions);
        trackError = await errorChecking(trackResponse, 'Error getting track from embed');
    }

    if (trackError < 0 || attempts > 3) {
        // return the track straight back if there is an error
        console.log('had to skip track from embed: ' + track.track.name);
        return new Promise((resolve, reject) => { resolve(track); });
    }

    let trackText = await trackResponse.text();

    let index = trackText.indexOf('id="resource"') + 39; // 39 because that's when the opening tag is done
    let char = trackText.charAt(index);
    let newstr = '';
    while (char && char !== '<') {
        newstr += char;
        index++;
        char = trackText.charAt(index);
    }

    let newobj;

    try {
        newobj = JSON.parse(decodeURIComponent(newstr));
    } catch (error) {
        console.log(error);
        console.log(newstr);
        console.log(decodeURIComponent(newstr));
        newobj = { preview_url: null };
    }
    // let newobj = JSON.parse(decodeURIComponent(newstr));
    let newtrack = track;
    newtrack.track.preview_url = newobj.preview_url;

    return new Promise((resolve, reject) => { resolve(newtrack); });
}

function updateFinalScore() {
    let currentscore = $('#finalscore').prop('data-score');
    let currenttotal = $('#finalscore').prop('data-total');
    
    $('#finalscore').text(currentscore + '   ' + currenttotal + '/' + settings.numsongs);
}

function songLost(secret) {
    clearInterval(currentInterval);

    incorrectsongs.push(secret);

    $('#gameAudio')[0].pause();

    nextSong();
}

function songWon() {
    clearInterval(currentInterval);

    let addscore = $('#score').prop('data-score');
    let currentscore = $('#finalscore').prop('data-score');
    let newscore = currentscore + addscore;
    let currentcorrect = $('#finalscore').prop('data-correct');
    $('#finalscore').prop('data-score', newscore);
    $('#finalscore').prop('data-correct', ++currentcorrect);

    $('#gameAudio')[0].pause();

    nextSong();
}

function countdown(secret) {
    if ($('#gameAudio').prop('data-transitioning')) {
        return;
    }

    if (!document.hasFocus()) {
        return;
    }

    if (Math.floor($('#score').prop('data-score')) === 0) {
        songLost(secret);
        return;
    }

    if ($('#gameAudio').prop('paused')) {
        $('#gameAudio')[0].play();
    }

    let score = $('#score').prop('data-score');
    let newscore = Math.floor(score - (START_SCORE / (settings.songlength * 10)));
    if (newscore < 0) {
        newscore = 0;
    }
    $('#score').prop('data-score', newscore);
    $('#score').text(newscore);

    
    // remove the elements
    let children = $('#songs > .songgroup:not(.fadingout)');
    // let timepassed = $('#gameAudio').prop('currentTime') - $('#gameAudio').prop('data-starttime');
    let offset = START_SCORE * 0.5;
    let remainingscore = START_SCORE - offset;
    let leftoversongs = 2;
    let range = remainingscore / (NUM_SONGS - leftoversongs);
    let max = remainingscore - ((NUM_SONGS - children.length) * range);
    let min = remainingscore - ((NUM_SONGS - children.length + 1) * range);

    if (min <= newscore && newscore < max) {
        let remove = rand(0, children.length - 1);
        let id;

        if (children[remove].getElementsByClassName('words')[0].getElementsByClassName('title')[0].innerText === secret.track.name) {
            id = '#' + children[remove + 1].id;
        } else {
            id = '#' + children[remove].id;
        }

        $(id).addClass('fadingout');
        $(id).fadeOut(400, () => {
            if ($(id).is(':hidden')) {
                $(id).remove();
            }
        });
    }
}

function startPlaying(secret) {
    $('#score').prop('data-score', START_SCORE);
    $('#score').text(START_SCORE);

    $('#gameAudio').prop('src', secret.track.preview_url);
    $('#gameAudio')[0].load();

    let startTime = rand(0, 30 - settings.songlength);
    $('#gameAudio').prop('currentTime', startTime);
    $('#gameAudio').prop('data-starttime', startTime);
    let audio = $('#gameAudio')[0];

    audio.oncanplaythrough = function () {
        $('#gameAudio').prop('data-transitioning', false);
        audio.play();
        currentInterval = setInterval(_ => { countdown(secret) }, 100);
        audio.oncanplaythrough = function () {};
    };
}

function startSearchingFromIndex(song, index) {
    for (let i = index; i < index + NUM_SONGS + 1; i++) {
        if (i < currentSongs.length && currentSongs[i] === song) {
            return i;
        }
    }

    for (let i = index; i > index - NUM_SONGS - 1; i--) {
        if (i >= 0 && currentSongs[i] === song) {
            return i;
        }
    }

    return -1;
}

function nextSong() {
    $('#songs').empty();

    if ($('#finalscore').prop('data-total') === settings.numsongs) {
        showEndScreen();
        return;
    }

    $('#finalscore').prop('data-total', $('#finalscore').prop('data-total') + 1);
    updateFinalScore();

    let gameSongs = [];
    let original = currentSongs.slice(0); // deep copy

    let secretChoice = rand(0, NUM_SONGS);
    let secretStartIndex;
    let secret;

    for (let i = 0; i < NUM_SONGS; i++) {
        if (currentSongs.length === 0) {
            currentSongs = allSongs.slice(0);
        }

        let songIndex = rand(0, currentSongs.length);
        let song = currentSongs[songIndex];
        gameSongs.push(song);
        currentSongs.splice(songIndex, 1);

        if (i === secretChoice) {
            secretStartIndex = songIndex;
            secret = song;
        }
    }

    currentSongs = original;

    let secretIndex = startSearchingFromIndex(secret, secretStartIndex);
    if (secretIndex === -1) {
        console.log('could not remove secret from currentSongs');
    } else {
        currentSongs.splice(secretIndex, 1);
        if (currentSongs.length === 0) {
            currentSongs = allSongs.slice(0);
        }
    }

    for (let i = 0; i < gameSongs.length; i++) {
        let image;
        if (gameSongs[i].track.album.images.length !== 0) {
            image = gameSongs[i].track.album.images[0].url;
        } else {
            image = null;
        }
        let artists = gameSongs[i].track.artists[0].name;
        for (let j = 1; j < gameSongs[i].track.artists.length; j++) {
            artists += ', '
            artists += gameSongs[i].track.artists[j].name;
        }
        let explicit = '';
        if (gameSongs[i].track.explicit) {
            explicit = '<span class="explicit"><div class="explicit-e">E</div></span>';
        }

        // let topmargin = 130;
        // let betweenmargin = 30;
        // let height = 90;
        // let style = 'style="top: ' + (topmargin + (betweenmargin * i) + (height * i)) + 'px"';
        let style = 'style="--songindex: ' + i + '"';

        let option = $('<div id="songoption-' + i + '" class="songgroup group" ' + style + ' >' +
                            '<img class="image portion" src="' + image + '" alt="/images/image_not_found.png" width="300" height="300" />' + 
                            '<div class="words portion">' + 
                                '<span class="title">' + gameSongs[i].track.name + '</span>' +
                                explicit +
                                '<span class="author">By ' + artists + '</span>' + 
                            '</div>' +
                            '<img class="spotifylogo blacklogo logotransition" src="/images/Spotify_Icon_RGB_Black.png" />' +
                            '<img class="spotifylogo whitelogo logotransition" src="/images/Spotify_Icon_RGB_White.png" />' +
                        '</div>');

        option.click(function() {
            if ($(this).hasClass('songcorrect') || $(this).hasClass('songincorrect')) {
                return;
            }

            $('#gameAudio').prop('data-transitioning', true);
            let classtoadd;
            if (gameSongs[i] === secret) {
                classtoadd = 'songcorrect';
            } else {
                classtoadd = 'songincorrect';
            }
            $(this).addClass(classtoadd);
            $(this).children('.whitelogo').fadeOut(100);
            setTimeout(() => $(this).removeClass(classtoadd), 800);
            setTimeout(() => optionClicked(gameSongs[i], secret), 500);
        });
        $('#songs').append(option);
    }

    startPlaying(secret);
}

function startGame() {
    showGame();

    $('#score').prop('data-score', START_SCORE);
    $('#finalscore').prop('data-score', 0);
    $('#finalscore').prop('data-correct', 0);
    $('#finalscore').prop('data-total', 0);

    $('#score').text(START_SCORE);
    $('#finalscore').text('0' + '   ' + '1/' + settings.numsongs);

    incorrectsongs = [];

    nextSong();
}

function optionClicked(option, secret) {
    if (option === secret) {
        songWon();
    } else {
        songLost(secret);
    }
}

async function loadSongs() {
    currentSongs = [];
    allSongs = [];
    let numTracks = 0;
    let numFinished = 0;
    let access_token = localStorage.getItem('access_token');

    for (let i = 0; i < currentIndices.length; i++) {
        numTracks += allPlaylists[currentIndices[i]].totalTracks;
    }

    $('#progressbar').text('Loaded ' + numFinished + '/' + numTracks + ' tracks');

    for (let i = 0; i < currentIndices.length; i++) {
        let numSkipped = 0;
        let index = currentIndices[i];

        // if this playlist has already been processed then just add it to currentSongs
        if (allPlaylists[index].tracks.length === allPlaylists[index].totalTracks && allPlaylists[index].tracks.length !== 0) {
            currentSongs = currentSongs.concat(allPlaylists[index].tracks);
            numFinished += allPlaylists[index].totalTracks;
            $('#progressbar').text('Loaded ' + numFinished + '/' + numTracks + ' tracks');
            continue;
        } else {
            allPlaylists[index].tracks = [];
        }

        let tracksURL;
        // do it like this because liked songs has a different url and it is the liked songs if the index is 0
        if (index === 0) {
            tracksURL = 'https://api.spotify.com/v1/me/tracks?limit=50';
        } else {
            tracksURL = 'https://api.spotify.com/v1/playlists/' + allPlaylists[index].id + '/tracks?limit=50';
        }
        let tracksOptions = {
            method: 'GET',
            mode: 'cors',
            headers: { 'Authorization': 'Bearer ' + access_token }
        };

        let tracksResponse;
        let tracks;

        do {
            // to cut off the function if not longer need to load this one
            // there are multiple so that it can get cut off no matter where
            // it is in the stage
            if ($('#progressbar').is(':hidden')) {
                return;
            }

            tracksResponse = await fetch(tracksURL, tracksOptions);

            let tracksError = await errorChecking(tracksResponse, 'Error fetching tracks');
            let attempts = 0;

            while (tracksError === REFRESH_SUCCESSFUL) {
                attempts++;
                if (attempts > 3) {
                    break;
                }
                tracksOptions.headers = { 'Authorization': 'Bearer ' + localStorage.getItem('access_token') };
                tracksResponse = await fetch(tracksURL, tracksOptions);
                tracksError = await errorChecking(tracksResponse, 'Error fetching tracks');
            }

            if (tracksError === UNAUTHORIZED) {
                return;
            }

            if (tracksError < 0 || attempts > 3) {
                console.log('had to skip 50 tracks from ' + allPlaylists[index].name);
                tracksURL = tracks.next;
                continue;
            }

            tracks = await tracksResponse.json();

            // This has to be done because there is a bug in the spotify API where blend playlists
            // incorrectly return a total of 0 when called from the /me/playlists endpoint but not
            // when called from the /playlists/{id} endpoint
            if (allPlaylists[index].totalTracks !== tracks.total) {
                numTracks -= allPlaylists[index].totalTracks;
                allPlaylists[index].totalTracks = tracks.total;
                numTracks += tracks.total;
            }

            let skipped = [];

            for (let j = 0; j < tracks.items.length; j++) {
                // to cut off the function if no longer need to load this one
                if ($('#progressbar').is(':hidden')) {
                    return;
                }

                // have to make sure the preview url exists because is null for some
                if (tracks.items[j].track.preview_url) {
                    allPlaylists[index].tracks.push(tracks.items[j]);
                    currentSongs.push(tracks.items[j]);
                    numFinished++;
                } else {
                    // if it doesn't have an id (for example if it's a local track) then we need to skip it
                    // otherwise there is another way to get the preview, we will get it after we
                    // finish the ones that work
                    if (!tracks.items[j].track.id) {
                        numTracks--;
                        numSkipped++;
                        console.log('Skipped: ' + tracks.items[j].track.name);
                    } else {
                        skipped.push(tracks.items[j]);
                    }
                }
                $('#progressbar').text('Loaded ' + numFinished + '/' + numTracks + ' tracks');
            }

            // get the null preview url's (gotten from the embed version)
            // for (let n = 0; n < skipped.length; n++) {
            //     // to cut off the function if no longer need to load this one
            //     if ($('#progressbar').is(':hidden')) {
            //         return;
            //     }
            //     let newtrack = await getFromEmbed(skipped[n]);
            //     if (!newtrack.track.preview_url) {
            //         numTracks--;
            //         numSkipped++;
            //         console.log('Skipped: ' + newtrack.track.name);
            //     } else {
            //         allPlaylists[index].tracks.push(newtrack);
            //         currentSongs.push(newtrack);
            //         numFinished++;
            //     }
            //     $('#progressbar').text('Loaded ' + numFinished + '/' + numTracks + ' tracks');
            // }

            // tracks.next is null if there is no link for the next set of tracks
            tracksURL = tracks.next;
        } while (tracksURL);

        allPlaylists[index].totalTracks -= numSkipped;
    }


    // removing duplicates
    let duplicatesCounter = 0;
    let temp = [];
    
    for (let i = 0; i < currentSongs.length; i++) {
        duplicatesCounter++;
        $('#progressbar').text('Removing duplicates... ' + duplicatesCounter + '/' + numTracks);
        if (!arrayContains(temp, currentSongs[i])) {
            temp.push(currentSongs[i]);
        } else {
            numFinished--;
            numTracks--;
        }
    }

    $('#progressbar').text('Loaded ' + numFinished + '/' + numTracks + ' tracks');

    currentSongs = temp;

    console.log(currentSongs);
    allSongs = currentSongs.slice(0);

    $('#startGame').show();
}

function arrayContains(arr, song) {
    for (let i = 0; i < arr.length; i++) {
        if (arr[i].track.id === song.track.id) {
            return true;
        }
    }

    return false;
}

function playlistButtonClicked(index) {
    playlistid = '#playlistbutton-' + index;
    if ($(playlistid).prop('data-selected')) {
        $(playlistid).removeClass('playlistselected');
        $(playlistid).prop('data-selected', false);
        $(playlistid + ' > .whitelogo').fadeIn(200);
        currentIndices.splice(currentIndices.indexOf(index), 1);

        $('#selectall').text('Select All');
        if (currentIndices.length === 0) {
            $('#submitselection').prop('disabled', true);
        }
    } else {
        $(playlistid).addClass('playlistselected');
        $(playlistid).prop('data-selected', true);
        $(playlistid + ' > .whitelogo').fadeOut(200);
        $(playlistid + ' > .whitelogo').removeClass('logotransition');
        currentIndices.push(index);
        $('#submitselection').prop('disabled', false);
    }
}

function selectAll() {
    if ($('#selectall').text() === 'Select All') {
        selectAllPlaylists();
    } else {
        deselectAllPlaylists();
    }
}

function selectAllPlaylists() {
    for (let i = 0; i < allPlaylists.length; i++) {
        $('#playlistbutton-' + i).addClass('playlistselected');
        $('#playlistbutton-' + i).prop('data-selected', true);
        $('#playlistbutton-' + i + ' > .whitelogo').fadeOut(200);
        $('#playlistbutton-' + i + ' > .whitelogo').removeClass('logotransition');
        currentIndices.push(i);
    }
    $('#selectall').text('Deselect All');
    $('#submitselection').prop('disabled', false);
}

function deselectAllPlaylists() {
    for (let i = 0; i < allPlaylists.length; i++) {
        $('#playlistbutton-' + i).removeClass('playlistselected');
        $('#playlistbutton-' + i).prop('data-selected', false);
        $('#playlistbutton-' + i + ' > .whitelogo').fadeIn(200);
    }
    currentIndices = [];
    $('#selectall').text('Select All');
    $('#submitselection').prop('disabled', true);
}

function setUpChart(data, labels) {
    let newdata = {
        labels: labels,
        datasets: [
            {
                label: 'Score',
                data: data,
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 50)',
            }
        ]
    };
    let config = {
        type: 'line',
        data: newdata,
        options: {
          responsive: true,
          maintainAspectRatio: false
        },
      };
    chart = new Chart($('#previousattempts'), config);
}

function setUpMissedSongs() {
    let numtotal = $('#finalscore').prop('data-total');
    let numcorrect = $('#finalscore').prop('data-correct');
    $('#numbercorrect').text('You got ' + numcorrect + ' out of ' + numtotal + ' correct');
    $('#missedsongs').empty();
    for (let i = 0; i < incorrectsongs.length; i++) {
        let image;
        if (incorrectsongs[i].track.album.images.length !== 0) {
            image = incorrectsongs[i].track.album.images[0].url;
        } else {
            image = null;
        }
        let artists = incorrectsongs[i].track.artists[0].name;
        for (let j = 1; j < incorrectsongs[i].track.artists.length; j++) {
            artists += ', '
            artists += incorrectsongs[i].track.artists[j].name;
        }
        let explicit = '';
        if (incorrectsongs[i].track.explicit) {
            explicit = '<span class="explicit"><div class="explicit-e">E</div></span>';
        }

        let style = 'style="--songindex: ' + i + '"';

        let option = $('<div id="incorrectsong-' + i + '" class="incorrectsongs songgroup group songincorrect" ' + style + ' >' +
                            '<img class="image portion" src="' + image + '" alt="/images/image_not_found.png" width="300" height="300" />' + 
                            '<div class="words portion">' + 
                                '<span class="title">' + incorrectsongs[i].track.name + '</span>' +
                                explicit +
                                '<span class="author">By ' + artists + '</span>' + 
                            '</div>' +
                            '<img class="spotifylogo blacklogo logotransition" src="/images/Spotify_Icon_RGB_Black.png" />' +
                        '</div>');

        $('#missedsongs').append(option);
    }
    if ($('#missedsongs').children().length === 0) {
        $('#missedsongs').append('<span id="nomissedsongs">Good job! No missed songs!</span>')
    }
}

function calculateEnding(number) {
    if (number % 10 === 1) {
        return 'st';
    } else if (number % 10 === 2) {
        return 'nd';
    } else if (number % 10 === 3) {
        return 'rd';
    } else {
        return 'th';
    }
}

function generalEndScreenStuff() {
    let all_scores = [];
    let all_dates = [];
    let finalscore = $('#finalscore').prop('data-score');
    let today = new Date();
    let dd = String(today.getDate()).padStart(2, '0');
    let mm = String(today.getMonth() + 1).padStart(2, '0'); // January is 0!
    
    $('#gameAudio').prop('src', '');
    $('#endscore').text('Score: ' + finalscore);
    
    let tempstr;
    if ((tempstr = localStorage.getItem('all_scores'))) {
        // splits it according to the commas and casts to numbers
        all_scores = tempstr.split(',').map(Number);
    }
    if ((tempstr = localStorage.getItem('all_dates'))) {
        // splits it according to the commas
        all_dates = tempstr.split(',');
    }

    let sortedScores = all_scores.slice(0).sort(function (a, b) { return b - a });
    let position = sortedScores.length;

    for (let i = 0; i < sortedScores.length; i++) {
        if (sortedScores[i] < finalscore) {
            position = i;
            break;
        }
    }

    let place = position + 1;
    let percentile = Math.floor(100 * (sortedScores.length - position) / (sortedScores.length + 1));
    if (place === 1) {
        $('#scoredescriptor').text('New high score!');
    } else if (place <= 5) {
        $('#scoredescriptor').text('This is your ' + (place) + calculateEnding(place) + ' best score!');
    } else {
        $('#scoredescriptor').text('This score is in the ' + percentile + calculateEnding(percentile) + ' percentile!');
    }

    all_scores.push(finalscore);
    all_dates.push(mm + '/' + dd);

    localStorage.setItem('all_scores', all_scores);
    localStorage.setItem('all_dates', all_dates);


    return { all_scores: all_scores, all_dates: all_dates };
}

function fadeIn(selector) {
    $(selector).addClass('fadein');
    $(selector).show();
    setTimeout(() => {
        $(selector).removeClass('fadein');
    }, 1000);
}

function submitSelection() {
    showBeforeStart();
    loadSongs();
}

function showLogin() {
    $('body > *:not(#title, footer)').hide();
    $('.login').show();
}

function showLoggedin() {
    $('body > *:not(#title, footer)').hide();
    $('.loggedin').show();
}

function showPlaylists() {
    deselectAllPlaylists();
    $('#backbutton').off('click');
    $('#backbutton').click(() => showLoggedin());
    $('body > *:not(#backbutton)').hide();
    $('.spotifylogo').addClass('logotransition');
    $('.playlists').show();
    currentSongs = [];
    allSongs = [];
}

function showBeforeStart() {
    $('#backbutton').off('click');
    $('#backbutton').click(() => showPlaylists());
    $('body > *:not(#backbutton, footer)').hide();
    $('.beforestart:not(#startGame)').show();
}

function showCustomization() {
    $('.customization').fadeIn();
}

function hideCustomization() {
    $('.customization').fadeOut();
}

function showGame() {
    $('#backbutton').off('click');
    $('#backbutton').click(quitGame);
    $('body > *:not(#backbutton)').hide();
    $('.game:not(#gameAudio)').show();
}

function showEndScreen() {
    $('#backbutton').off('click');
    $('#backbutton').click(() => {
        submitSelection();
        chart.destroy();
    });
    $('body > *:not(#backbutton)').hide();

    let tempobj = generalEndScreenStuff();
    setUpMissedSongs();
    setUpChart(tempobj.all_scores, tempobj.all_dates);
    
    $('.endscreen').show();
}

function changeUser() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.replace('/login?show_dialog=true');
}

function quitGame() {
    $('#gameAudio')[0].pause();
    clearInterval(currentInterval);
    submitSelection();
}

function incrementNumSongs(diff) {
    let toset = parseInt($('#currentnumsongs').text()) + diff;
    if (toset <= 0) {
        toset = 1;
        // TODO: make this endless mode
    }
    $('#currentnumsongs').text(toset);
}

function incrementSongLength(diff) {
    let toset = parseInt($('#currentsonglength').text()) + diff;
    if (toset <= 0) {
        toset = 1;
    } else if (toset > 30) {
        toset = 30;
    }
    $('#currentsonglength').text(toset);
}

function confirmSettings() {
    settings.numsongs = parseInt($('#currentnumsongs').text());
    settings.songlength = parseInt($('#currentsonglength').text());
    localStorage.setItem('settings', JSON.stringify(settings));
    hideCustomization();
}

function updateSettingsText() {
    $('#currentnumsongs').text(settings.numsongs);
    $('#currentsonglength').text(settings.songlength);
}

function resetDefaultSettings() {
    settings.numsongs = 10;
    settings.songlength = 8;
    updateSettingsText();
}

function cancelSettings() {
    hideCustomization();
    updateSettingsText();
}

function shareButton() {
    let message = 'I just got a score of ' + $('#finalscore').prop('data-score') + '! Check it out at: www.jukeboxhero.app';
    if ($('body').hasClass('hasHover')) {
        navigator.clipboard.writeText(message);
        $('#copymessage').fadeIn(function() {
            setTimeout(() => $('#copymessage').fadeOut(), 1000);
        });
    } else {
        navigator.share(message);
    }
}

function watchForHover() {
    // lastTouchTime is used for ignoring emulated mousemove events
    let lastTouchTime = 0;

    function enableHover() {
        if (new Date() - lastTouchTime < 500) {
            return;
        }
        document.body.classList.add('hasHover');
    }

    function disableHover() {
        document.body.classList.remove('hasHover');
    }

    function updateLastTouchTime() {
        lastTouchTime = new Date();
    }

    document.addEventListener('touchstart', updateLastTouchTime, true);
    document.addEventListener('touchstart', disableHover, true);
    document.addEventListener('mousemove', enableHover, true);

    enableHover();
}

document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
        $('#gameAudio')[0].pause();
    }
});


main();
watchForHover();
