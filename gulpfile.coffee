'use strict'
gulp           = require 'gulp'
gp             = (require 'gulp-load-plugins') lazy: false
path           = require 'path'
browserify     = require 'browserify'
coffee         = require 'gulp-coffee'
source         = require 'vinyl-source-stream'
mochaPhantomJS = require('gulp-mocha-phantomjs')
concat         = require('gulp-concat')
runSequence    = require('run-sequence')
hamlc          = require('gulp-haml-coffee')

# Compile 
gulp.task "coffeeit", ->
  gulp.src('src/coffee/**/*.coffee')
    .pipe coffee(bare: true)
    .pipe gulp.dest('./lib')

  gulp.src('src/html/demo.coffee')
    .pipe coffee(bare: true)
    .pipe gulp.dest('./dist/js')

# Build JS for distribution/bower
gulp.task 'dist:js', ->
  browserify
    debug: true
    entries: ['./index.js']
    extensions: ['.js']
    standalone: "BrushE"
  .transform 'debowerify'
  .bundle()

  # Pass desired file name to browserify with vinyl
  .pipe source 'BrushE.js'

  # Start piping stream to tasks!
  .pipe gulp.dest 'dist/js'

# Build CSS for distribution/bower
gulp.task 'dist:css', ->
  gulp.src 'assets/css/**/*.sass'
    .pipe gp.plumber()
    .pipe gp.rubySass style: 'compressed', loadPath: ['bower_components', '.']
    .pipe gp.cssmin keepSpecialComments: 0
    .pipe gulp.dest 'dist/css'

# Move Images to dist folder
gulp.task 'dist:images', ->
  gulp.src 'assets/images/*'
    .pipe gulp.dest 'dist/images'

# Compile Index
gulp.task "compile:index", ->
  gulp.src('src/html/index.hamlc')
  .pipe(hamlc())
  .pipe(gulp.dest('./'))

# Testing
gulp.task "test", ->
  browserify
    entries: ['./spec/spec.coffee']
    extensions: ['.coffee', '.js']
  .transform 'coffeeify'
  .bundle()
  .pipe source 'spec.js'
  .pipe gulp.dest 'test/spec'

  gulp.src("test/runner.html").pipe mochaPhantomJS(
    reporter: "spec",
    phantomjs: {
      'webSecurityEnabled': false    
    }
  )

# Register Tasks
gulp.task 'build', ->
  runSequence(['dist:images', 'dist:css', 'compile:index'], 'coffeeit', 'dist:js')

gulp.task 'spec', ->
  runSequence('coffeeit', 'dist:js', 'test')

gulp.task 'default', ['spec']

# # Watching You!
# gulp.watch(['src/**/*.coffee', 'assets/css/**/*.sass'], ['default'])
# 