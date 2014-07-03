var socket = io.connect();

/**
 * FileReader:
 * IE 10+
 * FF 3.6+
 * Chrome 6+
 * Safari 6+
 * Opera 11.1+
 */

/* fileReader config */
var fileIterator = 0;
var partSize = 1024 * 2;

var readerOnLoad = function (file, id, evt) {
    socket.emit('uploadFileStart', {
        fileID: id,
        fileInfo: file
    });

    socket.on('uploadFileStartResult', function (data) {
        if (data.fileID === id) {
            if (data.isError) {
                console.log(data.error);
            } else {
                for (var i = 0; i < file.size; i += partSize) {
                    socket.emit('uploadFileChunk', {
                        fileID: id,
                        part: evt.target.result.slice(i, i + partSize)
                    });
                }
            }
        }
    });

    socket.on('chunkUploadEnd', function (data) {
        if (data.fileID === id) {
            if (data.isError) {
                console.log(data.error);
            } else {
                var progressBar = ((data.downloaded / file.size) * 100).toFixed(2);
                $('#progress-bar').css({
                    width: progressBar + '%'
                });
                $('#status-percent').text(progressBar + '%');
            }
        }
    });
};

$(window).on('load', function () {
    $('#buttonToStartUpload').on('click', function () {
        var files = $('#fileToUpload')[0].files;
        var reader = {};
        if (files.length > 0) {
            for (var i = 0, len = files.length; i < len; i += 1) {
                reader = new FileReader();
                console.log(files[i]);
                reader.onload = readerOnLoad.bind(reader, files[i], ++fileIterator);
                reader.readAsBinaryString(files[i]);
            }
        }
    });
});