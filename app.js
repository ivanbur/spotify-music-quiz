const express = require('express');
const bent = require('bent');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const client_id = '';
const client_secret = '';
const redirect_uri = 'http://localhost:3000/callback';
const stateKey = 'spotify_auth_state';
 
let app = express();

app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser());

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
function generateRandomString(length) {
    let text = '';
    let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

async function loginFunction(req, res) {
    let state = generateRandomString(16);
    res.cookie(stateKey, state);

    // application requests authorization
    let scope = 'playlist-read-private playlist-read-collaborative user-library-read';

    let params = new URLSearchParams();
    params.set('response_type', 'code');
    params.set('client_id', client_id);
    params.set('scope', scope);
    params.set('redirect_uri', redirect_uri);
    params.set('state', state);

    if (req.query.show_dialog) {
        params.set('show_dialog', true);
    }

    res.redirect('https://accounts.spotify.com/authorize?' + params.toString());
}

async function callbackFunction(req, res) {
    // application requests refresh and access tokens
    // after checking the state parameter

    let code = req.query.code || null;
    let state = req.query.state || null;
    let storedState = req.cookies ? req.cookies[stateKey] : null;

    if (state === null || state !== storedState) {
        let params = new URLSearchParams();
        params.set('error', 'state_mismatch');
        res.redirect('/#' + params.toString());
    } else {
        res.clearCookie(stateKey);
        let uri = 'https://accounts.spotify.com/api/token';
        let headers = {
            'Authorization': 'Basic ' + (Buffer.from(client_id + ':' + client_secret)).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        let postParams = new URLSearchParams();
        postParams.set('code', code);
        postParams.set('redirect_uri', redirect_uri);
        postParams.set('grant_type', 'authorization_code');

        let post = bent(uri, 'POST', 'json');

        let response;

        try {
            response = await post('', postParams.toString(), headers);
        } catch {
            res.send({ 'error': true });
            return;
        }
        
        let access_token = response.access_token;
        let refresh_token = response.refresh_token;

        let params = new URLSearchParams();
        params.set('access_token', access_token);
        params.set('refresh_token', refresh_token);
        res.redirect('/#' + params.toString());
    }
}

async function refreshTokenFunction(req, res) {
    // requesting access token from refresh token
    let refresh_token = req.query.refresh_token;
    let uri = 'https://accounts.spotify.com/api/token';
    let headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + (Buffer.from(client_id + ':' + client_secret)).toString('base64')
    };

    let postParams = new URLSearchParams();
    postParams.set('grant_type', 'refresh_token');
    postParams.set('refresh_token', refresh_token);

    let post = bent(uri, 'POST', 'json');
    let response;

    try {
        response = await post('', postParams.toString(), headers);
    } catch {
        res.send({ 'error': true });
        return;
    }
    
    let access_token = response.access_token;
    res.send({ 'access_token': access_token });
}

app.get('/login', loginFunction);

app.get('/callback', callbackFunction);

app.get('/refresh_token', refreshTokenFunction);

console.log('Listening on ' + (process.env.PORT || 3000));
app.listen(process.env.PORT || 3000);