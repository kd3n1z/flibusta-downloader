FROM node:18-alpine

WORKDIR /usr/src/flibusta-downloader

COPY package*.json ./

RUN npm install

COPY . .

RUN npm build

RUN npm start
