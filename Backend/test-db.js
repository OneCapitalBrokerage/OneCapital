import 'dotenv/config';
import mongoose from 'mongoose';
import Instrument from './Model/InstrumentModel.js';

async function checkInstruments() {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log('✅ MongoDB connected');

        const totalCount = await Instrument.countDocuments();
        console.log(`📊 Total instruments in DB: ${totalCount}`);

        // Get sample instruments
        const samples = await Instrument.find().limit(5);
        console.log('\n📝 Sample instruments:');
        samples.forEach(instrument => {
            console.log(`\n🔸 ${instrument.tradingsymbol}:`);
            console.log(`   Exchange: ${instrument.exchange}`);
            console.log(`   Segment: ${instrument.segment}`);
            console.log(`   Type: ${instrument.instrumentType}`);
            console.log(`   Expiry: ${instrument.expiry}`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔚 Database connection closed');
    }
}

checkInstruments();