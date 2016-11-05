
/**
 *  webpack config f. node app
 *  --------------------------
 * node hat Probleme, wenn die Abhaengigkeiten aus node_modules von Webpack
 * mit eingepackt werden. Deshalb ohne (-> externals).
 * Damit muss das node_modules-Verzeichnis mit ausgeliefert werden, oder
 * eine passende package.json (-> npm install --production).
 *
 * TODO: alles rauswerfen, das nur fuer webapp benoetigt wird
 *
 *  Verzeichnisstruktur:
 *    ./src        |source-code
 *         /css    |app styles
 *         ...     -> components, images
 *         /resource    |wird 1:1 nach dist kopiert
 *         /app.ts   -> app start
 *    ./dist       |target
 *    ./node_modules
 *    ./typings
 *    ./div        |alles andere
 *    ./package.json              |deps + version info
 *    ./tsconfig.json             |typescript (excludes!)
 *    ./typings.json              |typings
 *    ./webpack.config.js         |this
 *
 */

var path = require('path');
var fs = require('fs');
//var zlib = require('zlib');
// Webpack + Plugins
var webpack = require('webpack');
var CopyWebpackPlugin = require('copy-webpack-plugin');
var WebpackMd5Hash    = require('webpack-md5-hash');
var ExtractTextPlugin = require("extract-text-webpack-plugin");
//var CompressionPlugin = require('compression-webpack-plugin');

/**
 * Damit aus der command line Parameter uebergeben werde koennen, muss der export als function
 * aufgebaut werden. Die function liefert das config.Object zurueck.
 *
 * Der Funktions-Parameter "env" enthaelt alle per --env.par="blah" definierten Variablen.
 * z.B.:
 * ... --env.release --env.test1="blah"
 * -> env = { release: true, test1: "blah" }
 *
 */
module.exports = function(env) {

  env = env || {};
  var release = env.release || false;
  var SPK = env.spk || false;  // build f. SPK-Umgebung

  var ENV = process.env.NODE_ENV = process.env.ENV = release ? 'production' : 'development';
// Testserver
  var HOST = process.env.HOST || 'localhost';
  var PORT = process.env.PORT || 23000;

// Pfade/Dateinamen
  var cwd = process.cwd();
  var npmRoot = cwd + "/node_modules";
  var sourceDir = cwd + "/src";
  var filesTarget = 'resource'; //targetDir + "/resource"; -> copy-webpack-plugin (s.u.)
  var filesDir = sourceDir + '/' + filesTarget;
  var index_html = sourceDir + '/index.html';
// var vendorFile    = sourceDir + '/app/vendor.ts';
// var bootstrapFile = sourceDir + '/app/boot.ts';
  var bootstrapFile = sourceDir + '/main.ts';
  var sonstDir = cwd + "/div";
  var targetDir = cwd + "/dist";
  var package_json = cwd + '/package.json';
  var clientDir = cwd + "/../farc/dist";  // TODO anpassen fuer Client-Projekt
  var clientTarget = "static";

// package.json
  var PACKAGE = getPackage(package_json, ENV);

// index.html-metadata & app-var metadata -> process.env.metadata
  var metadata = {
    'VERSIONSTR': PACKAGE.name + ' ' + PACKAGE.version + '.' + PACKAGE.buildnumber + ' (' + ENV + ') - ' + PACKAGE.copyright,
    //'BASEURL': '/wstest02/',  // '/' fuer stand alone, '/context-root/' fuer wepapp (incl. abschliessendem /)
    // verwendet im <head>, von HtmlWebpackPlugin via output.publicPath
    // und beim Bootstrap -> provide(APP_BASE_HREF, {useValue: process.env.BASEURL})
    'BASEURL'   : '/',
    'HOST'      : HOST,
    'PORT'      : PORT,
    'NAME'      : PACKAGE.name,
    'VERSION'   : PACKAGE.version,
    'BUILD'     : PACKAGE.buildnumber,
    'DESC'      : PACKAGE.description,
    'COPY'      : PACKAGE.copyright,
    'ENV'       : ENV,
    'NODE_ENV'  : ENV,
    "SPK"       : SPK,
    "CONFIGFILE": "conf." + (release ? "prod" : "dev") + (SPK ? ".spk" : "") + ".json",
    "CONFIGPATH": "/" + filesTarget,
  };
//TODO package.json f. NW.js generieren
//     f. nw muss auch baseurl angepasst werden

  /*
   * Webpack configuration
   *
   * See: http://webpack.github.io/docs/configuration.html#cli
   */
  return {

    // for faster builds use 'eval'
    devtool: release ? 'source-map' : 'cheap-module-eval-source-map',
    target : 'node',  // web || node || node-webkit -> BaseUrl!!

    /*
     * Cache generated modules and chunks to improve performance for multiple incremental builds.
     * This is enabled by default in watch mode.
     * You can pass false to disable it.
     *
     * See: http://webpack.github.io/docs/configuration.html#cache
     * cache: false,
     *
     * The entry point for the bundle
     * Our Angular.js app
     *
     * See: http://webpack.github.io/docs/configuration.html#entry
     */
    entry: {
      // bootstrap-loader (s.a. https://github.com/shakacode/bootstrap-loader)
      //                  -> npm install bootstrap-loader bootstrap-sass + deps s. github + jquery
      // config -> ./.bootstraprc
//    'bootstrap' : release ? 'bootstrap-loader/extractStyles' : 'bootstrap-loader',
      // font awesome-loader (s.a. https://www.npmjs.com/package/font-awesome-webpack)
      //                     -> npm install font-awesome font-awesome-webpack
      // config -> ./font-awesome.config.js + ./font-awesome.config.less
//    'fontawesome': 'font-awesome-webpack!./font-awesome.config.js',
      // external libs
      // 'vendor': vendorFile,
      // angular app
      'server': bootstrapFile
    },

    // Config for our build files
    output: {
      path             : targetDir,
      publicPath       : metadata.BASEURL,
      // filename: '[name].[chunkhash].js',
      filename         : '[name].js',
      sourceMapFilename: '[file].map',  // [file] enthaelt .js|.css dadurch verschiedene mapS f. js und css
      // chunkFilename: '[id].[chunkhash].chunk.js',
      chunkFilename    : '[id].chunk.js',
      libraryTarget    : 'commonjs',
    },

    /*
     * Options affecting the resolving of modules.
     *
     * See: http://webpack.github.io/docs/configuration.html#resolve
     */
    resolve  : {
      // fallback: npmRoot,  // wg. symlink in /src
      // root: sourceDir,
      // remove other default values
      // ensure loader extensions match
      extensions: ['.ts', '.js', '.json', '.css', '.html', 'png', 'jpg', 'gif', 'scss', 'svg', 'woff', 'ttf', 'eot', 'otf', 'svg'],
      // falls so etwas gebraucht wird
      // alias: {
      //   'angular2/core': helpers.root('node_modules/@angular/core/index.js'),
      // },
      // An array of directory names to be resolved to the current directory
      modules   : [sourceDir, 'node_modules'],

    },
    // resolveLoader: {
    //   fallback: npmRoot,  // wg. symlink in /src
    // },
    /*
     * w/node alle externen Module ausblenden
     */
    externals: [
      /^(?!\.|\/).+/i,
    ],
    /*
     * Options affecting the normal modules.
     *
     * See: http://webpack.github.io/docs/configuration.html#module
     */
    module   : {

      /*
       * An array of automatically applied loaders.
       *
       * IMPORTANT: The loaders here are resolved relative to the resource which they are applied to.
       * This means they are not resolved relative to the configuration file.
       *
       * See: http://webpack.github.io/docs/configuration.html#module-loaders
       */
      rules: [
        // Support for .ts files.
        {
          test  : /\.ts$/,
          loader: 'awesome-typescript-loader',
          // loader: 'ts-loader',
          query : {
            'ignoreDiagnostics': [
              // falls die Fehlermeldungen storen sollten...
              // 2300, // 2300 -> Duplicate identifier
              // 2374, // 2374 -> Duplicate number index signature
              // 2307, // Cannot find module
              // 2688, // Cannot find type definition file for
              // 2339, // Property 'pipeP' does not exist on type 'Static'
              // 2345, //  Argument of type 'this' is not assignable to parameter of type
            ]
          }
          //exclude: [ /\.(spec|e2e)\.ts$/ ]
        },

        {test: /\.(png|jpg|gif)$/, loader: "url-loader?limit=50000&name=[path][name].[ext]"},
        {test: /\.json$/, loader: 'json'},
        {
          test: /^(?!.*\.min\.css$).*\.css$/, loader: ExtractTextPlugin.extract({
                                                                                  fallbackLoader: "style-loader",
                                                                                  loader        : "css-loader?sourceMap"
                                                                                })
        },
        // { test: /\.scss$/, loaders: ['style-loader',
        //                              ExtractTextPlugin.extract({
        //                                                          fallbackLoader: "style-loader",
        //                                                          loader: "css-loader?sourceMap"
        //                                                        }),
        //                              'sass-loader' +
        //                              '?outputStyle=expanded&' +
        //                              'root='+sourceDir+'&' +
        //                              '&includePaths[]'+npmRoot + '&' +
        //                              '&includePaths[]'+sourceDir
        //   ]},
//      { test: /\.html$/,  loader: 'raw-loader', exclude: [ index_html ] },
//       { test: /\.html$/, loader: "file-loader?name=error.html!" + "src" + "/error.html", exclude: [ index_html ] },
        // w/ font awesome-loader + bootstrap-loader
        {test   : /\.woff(2)?(\?v=[0-9]\.[0-9]\.[0-9])?$/,
          loader: "url-loader?limit=10000&minetype=application/font-woff"
        },
        {test: /\.(ttf|eot|svg)(\?v=[0-9]\.[0-9]\.[0-9])?$/, loader: "file-loader"}

      ],

      noParse: [
        sonstDir,
        /\.min\.js/,
        // path.join(cwd, 'node_modules', 'angular2', 'bundles'),
        npmRoot + '/zone.js/dist',
        /\/@types\/mongoose/,
      ]
    },

    /*
     * Add additional plugins to the compiler.
     *
     * See: http://webpack.github.io/docs/configuration.html#plugins
     */
    plugins: [
      new WebpackMd5Hash(),
      // new webpack.optimize.DedupePlugin(),  // prod only !f. watch mode
//    // new webpack.optimize.CommonsChunkPlugin({
      //   name: 'vendor',
      //   filename: 'vendor.[chunkhash].js',
      //   minChunks: Infinity
      // }),
      // von allen Modulen gemeinsam genutzte -> fkt. z.Zt nicht
      //new webpack.optimize.CommonsChunkPlugin({
      //  name: 'common',
      //  filename: 'common.[chunkhash].js',
      //  minChunks: 2,
      //  chunks: ['app', 'vendor', 'bootstrap', 'fontawesome']
      //}),

      // static assets
      new CopyWebpackPlugin([
        {
          from  : filesDir,  // + text files etc.
          to    : filesTarget,
          toType: 'dir'
        },
        {
          from  : clientDir,  // client app
          to    : clientTarget,
          toType: 'dir'
        },
        {from: package_json}
      ]),
      new ExtractTextPlugin("[name].[chunkhash].css"),

      // generating html (incl. script- + style-tags)
      // new HtmlWebpackPlugin({
      //   template: index_html,
      //   chunksSortMode: 'dependency'
      // }),
      new webpack.DefinePlugin({
        // Environment helpers
        'WEBPACK_DATA': {
          'metadata': JSON.stringify(metadata),
        }
      }),
      new webpack.ProvidePlugin({
        // TypeScript helpers
        // '__metadata': 'ts-helper/metadata',
        // '__decorate': 'ts-helper/decorate',
        // '__awaiter': 'ts-helper/awaiter',
        // '__extends': 'ts-helper/extends',
        // '__param': 'ts-helper/param',

        // 'Reflect': 'es7-reflect-metadata/dist/browser',  // wg. angular2 - klappt ohne?
        // jQuery global laden (-> npm install jquery) pri wg. bootstrap
        $     : "jquery",
        jQuery: "jquery"

      }),
      // new webpack.optimize.UglifyJsPlugin({
      //   beautify: release ? false : true,
      //   // TODO disable mangling because of a bug in angular2 beta.8
      //   // TODO -> stack overflow
      //   //mangle: release ? { screw_ie8 : true } : false,//prod
      //   mangle: false,
      //   compress : release ? { screw_ie8 : true}
      //                      : { screw_ie8 : true, keep_fnames: true, drop_debugger: false, dead_code: false, unused: false, },
      //   comments: release ? false : true,
      //   dead_code: release ? true : false,
      //   unused: release ? true : false,
      //   deadCode: release ? true : false
      // }),
      /* Damit die Komprimierung hilft, muss der Webserver entsprechend konfiguriert werden.
       * Die Konfigurationsdetails waeren zu klaeren, ebenso die Frage, wieviel das bringt.
       */ /*
       new CompressionPlugin({
       algorithm: gzipMaxLevel,
       regExp: /\.css$|\.html$|\.js$|\.map$/,
       threshold: 2 * 1024
       })
       */
      new webpack.LoaderOptionsPlugin({
        debug: !release,
        options: {
          context: cwd,
          output: { path :  targetDir },

          /**
           * Static analysis linter for TypeScript advanced options configuration
           * Description: An extensible linter for the TypeScript language.
           *
           * See: https://github.com/wbuchwalter/tslint-loader
           */
          tslint: {
            emitErrors: true,
            failOnHint: release,
            resourcePath: 'src'
          },
        }
      }),

    ],

    /**
     * Webpack Development Server configuration
     * Description: The webpack-dev-server is a little node.js Express server.
     * The server emits information about the compilation state to the client,
     * which reacts to those events.
     *
     * See: https://webpack.github.io/docs/webpack-dev-server.html
     */
    devServer: {
      port              : metadata.port,
      host              : metadata.host,
      historyApiFallback: true,
      watchOptions      : {
        aggregateTimeout: 300,
        poll            : 1000
      },
      outputPath        : targetDir
    },

    // we need this due to problems with es6-shim  (?)
    node: {
      global        : true,
      progress      : false,
      crypto        : 'empty',
      module        : false,
      clearImmediate: false,
      setImmediate  : false
    }
  }; // config
}; // function

/**
 * package.json holen und buildnumber++ eintragen
 */
function getPackage(package_json, env) {
  // TODO getrennte build-Zaehler f. prod. und dev. ??
  var pj = require(package_json);
  if (pj) {
    // buildnumber aus package.json holen (default 0)
    var buildnumber = pj.buildnumber || 0;
    // +1
    pj.buildnumber = ++buildnumber;
    // package.json mit der neuen buildnumber zurueckschreiben
    fs.writeFile(package_json, JSON.stringify(pj, null, 2));
    return pj;
  } else {
    throw "ERROR getting package.json";
  }
}

/* -> compressionPlugin
function gzipMaxLevel(buffer, callback) {
  return zlib['gzip'](buffer, {level: 9}, callback)
}
*/
