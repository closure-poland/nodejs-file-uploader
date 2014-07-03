var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var jade = require('jade');
var fs = require('fs');
var uuid = require('uuid');
var when = require('when');

server.listen(2000);

app.use(express.static('resources'));

app.get('/', function (req, res) {
    jade.renderFile('view.jade', {}, function (err, html) {
        if (err) throw err;
        res.send(html);
    });
});

var FileUploadExtensionError = function (message) {
    this.name = 'FileUploadExtensionError';
    this.message = message;
};

var FileUploadSizeError = function (message) {
    this.name = 'FileUploadSizeError';
    this.message = message;
};

var FileUploadOpenError = function (message, originalError) {
    this.name = 'FileUploadOpenError';
    this.message = message;
    this.originalError = originalError;
};

var FileUploadUnknownStreamError = function (message) {
    this.name = 'FileUploadUnknownStreamError';
    this.message = message;
};

var FileUploadWriteError = function (message, originalError) {
    this.name = 'FileUploadWriteError';
    this.message = message;
    this.originalError = originalError;
};

function isValidExtension(acceptedExtensions, name) {
    var ext = name.substr((~-name.lastIndexOf('.') >>> 0) + 2); // get extension from file name

    for (var i = 0, len = acceptedExtensions.length; i < len; i += 1) {
        if (acceptedExtensions[i] === ext) {
            return true;
        }
    }
    return false;
}

function isCorrectSize(maxSize, size) {
    if (size > maxSize) {
        return false;
    }
    return true;
}

function closeFile(fileID) {
    this.files[fileID].stream.end();
    delete this.files[fileID];
}


var Upload = function () {
    this.files = {};
    this.timeout = 1000 * 60;
};

Upload.prototype.uploadFileStart = function (fileID, fileInfo) {
    var uploadFileStartDeferred = when.defer();

    if (!isValidExtension(['jpg', 'deb', 'png', 'pdf'], fileInfo.name)) {
        return uploadFileStartDeferred.resolver.reject(new FileUploadExtensionError('Invalid file extension.'));
    }

    if (!isCorrectSize(20000000, fileInfo.size)) {
        return uploadFileStartDeferred.resolver.reject(new FileUploadSizeError('File is too large.'));
    }

    this.files[fileID] = {
        fileInfo: fileInfo,
        stream: null,
        downloaded: 0,
        timeout: setTimeout(closeFile.bind(this, fileID), this.timeout)
    };

    this.files[fileID].stream = fs.createWriteStream('files/' + this.files[fileID].fileInfo.name, { flags: 'w', encoding: 'binary' });
    this.files[fileID].stream.on('open', function (result) {
        uploadFileStartDeferred.resolver.resolve();
    });
    this.files[fileID].stream.on('error', function (error) {
        uploadFileStartDeferred.resolver.reject(new FileUploadOpenError('Error while opening file.', error));
    });

    return uploadFileStartDeferred.promise;
};

Upload.prototype.uploadFileChunk = function (fileID, part) {
    var uploadFileChunkDeferred = when.defer();
    var self = this;

    if (!this.files[fileID]) {
        return uploadFileChunkDeferred.resolver.reject(new FileUploadUnknownStreamError('Stream ID unknown.'));
    }

    clearTimeout(this.files[fileID].timeout);

    this.files[fileID].stream.write(new Buffer(part, 'binary'), function (error) {
        var end;

        if (error) {
            closeFile.bind(self, fileID);
            return uploadFileChunkDeferred.resolver.reject(new FileUploadWriteError('Error while writing to file.', error));
        }

        self.files[fileID].downloaded += part.length;

        if (self.files[fileID].downloaded === self.files[fileID].fileInfo.size) {
            end = self.files[fileID].downloaded;
            closeFile.bind(self, fileID);
        } else {
            self.files[fileID].timeout = setTimeout(closeFile.bind(self, fileID), self.timeout);
        }

        uploadFileChunkDeferred.resolver.resolve({ downloaded: (end || self.files[fileID].downloaded) });
    });

    return uploadFileChunkDeferred.promise;
};


io.sockets.on('connection', function (socket) {
    var uploadManager = new Upload();

    socket.on('uploadFileStart', function (data) {
        var resultObject = {
            fileID: data.fileID,
            isError: false
        };

        uploadManager.uploadFileStart(data.fileID, data.fileInfo).then(function (result) {
            socket.emit('uploadFileStartResult', resultObject);
        }, function (err) {
            resultObject.isError = true;
            resultObject.error = err.message;
            socket.emit('uploadFileStartResult', resultObject);
        });
    });

    socket.on('uploadFileChunk', function (data) {
        var resultObject = {
            fileID: data.fileID,
            isError: false
        };

        uploadManager.uploadFileChunk(data.fileID, data.part).then(function (result) {
            resultObject.downloaded = result.downloaded;
            socket.emit('chunkUploadEnd', resultObject);
        }, function (err) {
            resultObject.isError = true;
            resultObject.error = err.message;
            socket.emit('chunkUploadEnd', resultObject);
        });
    });
});
