import Homey from 'homey';

class AmsReaderApp extends Homey.App {
  async onInit() {
    this.log('AMS reader app started');
  }
}

module.exports = AmsReaderApp;
