'use strict'

const spawn = require('cross-spawn')
const path = require('path')
const os = require('os')

function isString(input) {
  return typeof input === 'string'
}

function isNumber(input) {
  return !isNaN(input) && isFinite(input)
}

function isDefined(input) {
  return typeof input !== 'undefined' && input !== null
}

function isBoolean(input) {
  return typeof input === 'boolean'
}

const OS_SHELL = os.platform() === 'win32' ? 'bat' : 'sh'

class RunModule {

  constructor(opts) {

    opts = isDefined(opts) ? opts : {}

    this.debug = isBoolean(opts.debug) ? opts.debug : false

    this.executable = path.resolve('.', 'node_modules', '.bin', opts.bin)
    this.flags = Array.isArray(opts.flags) ? opts.flags : isString(opts.flags) ? [ opts.flags ] : '' 
    this.env = opts.env || {}
    
    if (this.debug) console.log(`command: ${this.command}`)

    this.initTimeout = isNumber(opts.initTimeout) ? opts.initTimeout : 15000

    this.pipe = isBoolean(opts.pipe)  ? opts.pipe  : false

    this.errors = []

    this.isStarting = false
    this.isRunning = false
    this.isClosed = false
    this.closeRequested = false
  }

  async start() {

    if (this.mock === 'success') {
      return true
    } else if (this.mock === 'failure') {
      throw new Error(`mock test: failure`)
    }

    if (this.isStarting || this.isRunning) {
      if (this.debug) console.log('server is already running')
      return true
    }

    if (this.closeRequested) {
      throw new Error(`close has been requested`)
    }

    this.isStarting = true

    return new Promise((resolve, reject) => {

      this.process = spawn(this.executable, this.flags, { env: this.env })

      this.process.on('error', err => {
        if (this.debug) console.log(`child process error: ${err}`)
        this.errors.push(err)
      })

      this.process.stdout.on('data', (data) => {
        if (this.pipe) console.log(`${data}`)
      })

      this.process.stderr.on('data', (data) => {
        if (this.pipe) {
          console.error(`${data}`)
        }
        if (this.isStarting && !this.isRunning && !this.closeRequested) {
          this.isRunning  = true
          this.isStarting = false
          this.isClosed   = false
          resolve(true)
        }
      })

      this.process.on('message', (message) => {
        //console.log(`child process message: ${message}`)
      })

      this.process.on('close', (code, signal) => {
        if (this.debug) console.log(`child process close: code=${code}, signal=${signal}`)
      })

      this.process.on('exit', (code, signal) => {
        if (this.debug) console.log(`child process exit: code=${code}, signal=${signal}`)
        this.isStarting = false
        this.isRunning  = false
        this.manually   = false
        this.isClosed   = true
      })

      // timeout check to be sure we are not stuck somewhere in the process
      setTimeout(() => {
        if (this.isStarting && !this.isRunning && !this.closeRequested) {
          const errors = (this.errors.length) ? this.errors.join('\n') : 'timeout'
          const error = `couldn't start the server in time: ${errors}`
          reject(new Error(error))
        }
      }, this.initTimeout)
    })
  }

  async stop () {
    if (!this.process) { return true }

    if (OS_SHELL === 'bat') {
      this.process.kill('SIGINT')
    } else {
      this.process.kill('SIGHUP')
    }

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (!this.isRunning) {
          resolve(true)
        } else {
          reject(new Error(`couldn't stop the server`))
        }
      }, 1000)
    })
  }
}

const runModule = (api, conf) => new RunModule(api, conf)
module.exports = runModule
module.exports.default = runModule
