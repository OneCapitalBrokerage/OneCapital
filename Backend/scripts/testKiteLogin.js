// scripts/testKiteLogin.js
// Test script to understand complete Kite login flow
// Usage: node scripts/testKiteLogin.js

import { authenticator } from 'otplib';

const testFullLogin = async () => {
    console.log('\n🔍 Testing Complete Kite Login Flow...\n');

    // Credentials
    const user_id = 'ZJX292';
    const password = 'Anjel@7878';
    const totp_secret = 'NZDM2DTQKRAEP74AIK53JW27B466UZND';

    try {
        // ============ STEP 1: Login ============
        console.log('═══════════════════════════════════════════════');
        console.log('STEP 1: POST /api/login');
        console.log('═══════════════════════════════════════════════');

        const loginResponse = await fetch('https://kite.zerodha.com/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
            },
            body: new URLSearchParams({
                user_id: user_id,
                password: password,
                type: 'user_id'
            })
        });

        const loginData = await loginResponse.json();

        if (loginData.status !== 'success') {
            console.log('❌ Login failed:', loginData);
            return;
        }

        const request_id = loginData.data.request_id;
        console.log('✅ Login successful!');
        console.log('   User:', loginData.data.profile.user_name);
        console.log('   Request ID:', request_id.substring(0, 20) + '...');
        console.log('   2FA Type:', loginData.data.twofa_type);

        // ============ STEP 2: Generate TOTP ============
        console.log('\n═══════════════════════════════════════════════');
        console.log('STEP 2: Generate TOTP');
        console.log('═══════════════════════════════════════════════');

        const totp = authenticator.generate(totp_secret);
        console.log('✅ Generated TOTP:', totp);
        console.log('   Time remaining:', 30 - Math.floor((Date.now() / 1000) % 30), 'seconds');

        // ============ STEP 3: Submit TOTP ============
        console.log('\n═══════════════════════════════════════════════');
        console.log('STEP 3: POST /api/twofa');
        console.log('═══════════════════════════════════════════════');

        const twofaResponse = await fetch('https://kite.zerodha.com/api/twofa', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
            },
            body: new URLSearchParams({
                user_id: user_id,
                request_id: request_id,
                twofa_value: totp,
                twofa_type: 'totp',
                skip_session: ''
            })
        });

        console.log('Response Status:', twofaResponse.status);

        // Check for cookies (might contain session info)
        const cookies = twofaResponse.headers.get('set-cookie');
        if (cookies) {
            console.log('Cookies received:', cookies.substring(0, 100) + '...');
        }

        const twofaText = await twofaResponse.text();
        console.log('\nResponse Body (raw):');
        console.log(twofaText);

        // Try to parse as JSON
        try {
            const twofaData = JSON.parse(twofaText);
            console.log('\nResponse Body (parsed):');
            console.log(JSON.stringify(twofaData, null, 2));

            // Check what we got
            if (twofaData.data?.access_token) {
                console.log('\n🎉 SUCCESS! Got access_token:', twofaData.data.access_token);
            } else if (twofaData.data?.request_token) {
                console.log('\n🎉 SUCCESS! Got request_token:', twofaData.data.request_token);
            } else if (twofaData.data?.enctoken) {
                console.log('\n🎉 SUCCESS! Got enctoken:', twofaData.data.enctoken.substring(0, 30) + '...');
            } else {
                console.log('\n⚠️ Check the response above for tokens');
            }

        } catch (e) {
            console.log('\n⚠️ Response is not JSON, might be a redirect');
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }
};

testFullLogin();
