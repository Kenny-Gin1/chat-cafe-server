import express from 'express';
import * as http from 'http';
import timeParser from './lib/date';
import logger from './logger';
import { messageParser } from './lib/messageParser';
import { LOGGER, SERVER_MESSAGES } from './messages';
import { CHANNELS } from './channels';
import { userNameCheck } from './lib/userNameCheck';

export const INACTIVITY_TIMER = 100000;

const socketio = require('socket.io');

const app = express();

const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

const io = socketio(server);

const clients = {};
const userTimeList = [];
const activeUserList = [];

const inactivityVariables = [];

let currentUser;

const disconnectUser = (socket, username) => {
    socket.emit(CHANNELS.USER_INACTIVITY, `${username} `);
    socket.broadcast.emit(CHANNELS.USER_HAS_LEFT, `${username} ${SERVER_MESSAGES.DISCONNECT_INACTIVITY}`);
    logger.info(`${username} ${LOGGER.USER.HAS_BEEN_DISCONNECTED}`);
    const indexOfUser = activeUserList.indexOf(username);
    activeUserList.splice(indexOfUser, 1);
};

const findUser = (activeUserList, username) => activeUserList.filter((r) => (r.username = username));

io.on(CHANNELS.CONNECTION, (socket: any) => {
    logger.info(LOGGER.INFO.CLIENT_CONNECTED);
    clients[socket.id] = socket;

    socket.on(CHANNELS.DISCONNECT, (username) => {
        clients[socket.id].removeAllListeners();
        logger.info(LOGGER.INFO.CLIENT_DISCONNECTED);
        const indexOfUser = activeUserList.indexOf(username);
        activeUserList.splice(indexOfUser, 1);
    });

    socket.on(CHANNELS.USER_HAS_LEFT, (username) => {
        socket.broadcast.emit(CHANNELS.USER_HAS_LEFT, `${username} ${SERVER_MESSAGES.USER_HAS_LEFT}`);
        logger.info(`${username} ${LOGGER.USER.HAS_LEFT}`);
        const indexOfUser = activeUserList.indexOf(username);
        activeUserList.splice(indexOfUser, 1);
    });

    socket.on(CHANNELS.USERNAME, (username) => {
        currentUser = findUser(userTimeList, username);
        currentUser[0].startTimer(username, socket);
        socket.emit(CHANNELS.USER_HAS_JOINED, `${SERVER_MESSAGES.WELCOME} ${username}`);
        socket.broadcast.emit(CHANNELS.USER_HAS_JOINED, `${username} ${SERVER_MESSAGES.USER_HAS_JOINED}`);
        logger.info(`${username} ${LOGGER.USER.LOGGED_IN}`);
    });

    socket.on(CHANNELS.USERNAME_CHECK, (username) => {
        userNameCheck(username, activeUserList, socket);
        userTimeList.push({
            username,
            startTimer: (username, socket) => {
                inactivityVariables[username] = setTimeout(disconnectUser, INACTIVITY_TIMER, socket, username);
            },
            resetTimer: (username) => {
                clearTimeout(inactivityVariables[username]);
            },
        });
    });
    socket.on(CHANNELS.SEND_MESSAGES, (content) => {
        const newContent = messageParser(content, timeParser);
        currentUser = findUser(userTimeList, newContent.user);
        currentUser[0].resetTimer(newContent.user);
        socket.broadcast.emit(CHANNELS.RECEIVE_MESSAGES, JSON.stringify(newContent));
        logger.info(LOGGER.USER.NEW_MESSAGES);
        currentUser[0].startTimer(newContent.user, socket);
    });

    const handleExit = (signal) => {
        logger.info(`${signal} ${LOGGER.INFO.RECEIVED_SIGNAL}`);
        delete clients[socket.id];
        socket.removeAllListeners();
        server.close(() => {
            logger.info(LOGGER.INFO.HTTP_SERVER_CLOSED);
            process.exit();
        });
        setImmediate(() => server.emit(CHANNELS.CLOSE));
    };

    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);
});

server.listen(PORT, () => {
    logger.info(`${LOGGER.INFO.LISTENING_ON} ${PORT}`);
});
