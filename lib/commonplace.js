var fs = require('fs');
var path = require('path');

var info = require('./info');
var utils = require('./utils');


function install() {
    var commonplace_src = path.resolve(__dirname, '../src');
    var local_src = path.resolve(process.cwd(), info.src_dir());
    console.log('Installing Commonplace...');
    console.log('Source:       ' + commonplace_src);
    console.log('Destination:  ' + local_src);

    var existing_manifest = path.resolve(local_src, '.commonplace');
    if (fs.existsSync(existing_manifest)) {
        var version = JSON.parse(fs.readFileSync(existing_manifest)).version;
        if (varsion !== info.version()) {
            console.error('Commonplace installation already exists from different version.');
            console.error('You must delete or update the existing installation.');
            console.error('Installation aborted.');
            process.exist();
        } else {
            console.warn('Existing commonplace installation found. Overwriting.');
        }
    }

    var files_copied = utils.copyDir(commonplace_src, local_src);
    console.log('Copied ' + files_copied + ' files.');

    // Write a commonplace manifest.
    fs.writeFile(
        path.resolve(local_src, '.commonplace'),
        JSON.stringify({version: info.version()}),
        function(err) {
            if (err) {console.error('Error creating commonplace manifest.', err);}
        }
    );

    console.log('Initializing distributable files...');
    utils.glob(local_src, '.dist', function(err, files) {
        files.forEach(function(file) {
            if (fs.existsSync(file)) {
                console.warn('Distributable file exists: ' + file);
                return;
            }
            fs.readFile(file, function(err, data) {
                fs.writeFile(file.substr(file.length - 5), data, function(err) {
                    if (err) {
                        console.warn('Error initializing ' + file, err);
                    }
                });
            });
        });
        console.log('Done.');
    });
}

function clean() {
    var targets = [
        '_tmp',
        'src/templates.js',
        'src/media/css/include.css',
        'src/media/js/include.js',
        'src/locales/'
    ];
    targets.forEach(function(path) {
        fs.stat(path, function(err, data) {
            if (err) return;

            if (data && data.isDirectory()) {
                utils.rmdirRecursive(path);
            } else {
                utils.removeFile(path);
            }
        });
    });

    var css_dir = 'src/media/css/';
    fs.exists(css_dir, function(exists) {
        if (!exists) {
            console.warn('CSS directory does not exist.');
            return;
        }
        utils.glob(css_dir, '.styl.css', function(err, filepaths) {
            if (err) {
                console.warn('There was an error iterating the CSS directory.', err);
                return;
            }
            filepaths.forEach(function(filePath) {
                utils.removeFile(filepath, null);
            });
        });
    });
}

function generate_langpacks() {
    var process_file = require('./generate_langpacks').process_file;
    var langpacks_path = info.src_dir() + '/locales/';

    if (!fs.existsSync(langpacks_path)) {
        console.log('Langpacks path does not exist. Creating: ' + langpacks_path);
        fs.mkdirSync(langpacks_path);
    }
    utils.glob('locale', '.po', function(err, filepaths) {
        if (err) {
            console.error(
                'Oops. Maybe `locale/` does not exist.\n' +
                'Failed to generate langpacks.\n',
                err);
            return;
        }
        filepaths.forEach(function(filepath) {
            var path_regex = /locale\/([^\/]+?)\/LC_MESSAGES\/(.+?).po/;
            var match = path_regex.exec(filepath);
            process_file(filepath, match[1], langpacks_path + match[1] + '.js');
        });
    });
}

function extract_l10n() {
    var context = new (require('./extract_l10n').L10nContext)();
    var src_dir = info.src_dir();

    var nunjucks_parser = require('nunjucks').parser;
    var nunjucks_extensions = require('./deferparser').extensions || [];

    var file_count = 0;
    var init_html;  // These are needed to prevent race conditions.
    var init_js;

    function done() {
        file_count--;
        if (init_html && init_js && !file_count) {
            context.save_po('locale/templates/LC_MESSAGES/messages.pot', function(err) {
                if (err) {
                    console.error('Could not save extracted strings.', err);
                    return;
                }
                console.log('Strings extracted successfully.');
                console.log(context.string_count() + ' strings extracted.');
            });
        }
    }

    utils.glob(path.resolve(src_dir, 'templates'), '.html', function(err, list) {
        if (err) {
            console.warn('Error extracting HTML string.', err);
            return;
        }

        file_count += list.length;
        init_html = true;

        list.forEach(function(html_file) {
            fs.readFile(html_file, function(err, data) {
                var str_data = data + '';
                if (err) {
                    console.warn('Could not extract strings from: ' + html_file, err);
                    return;
                }
                var parse_tree = nunjucks_parser.parse(str_data, nunjucks_extensions);
                context.extract_template(str_data, parse_tree, html_file);
                done();
            });
        });
    });

    utils.glob(path.resolve(src_dir, 'media/js'), '.js', function(err, list) {
        if (err) {
            console.warn('Error extracting JS string.', err);
            return;
        }

        file_count += list.length;
        init_js = true;

        list.forEach(function(js_file) {
            fs.readFile(js_file, function(err, data) {
                if (err) {
                    console.warn('Could not extract strings from: ' + js_file, err);
                    return;
                }
                context.extract_js(data + '', js_file);
                done();
            });
        });
    });
}

module.exports.install = install;
module.exports.clean = clean;
module.exports.generate_langpacks = generate_langpacks;
module.exports.extract_l10n = extract_l10n;