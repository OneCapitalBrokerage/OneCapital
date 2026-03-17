export const legalDocumentTabs = [
  { key: 'terms', label: 'Terms & Conditions' },
  { key: 'privacy', label: 'Privacy Policy' },
];

const legalDocuments = {
  terms: {
    title: 'Terms & Conditions',
    subtitle: 'Account opening, trading access, and customer responsibilities',
    icon: 'gavel',
    defaultLanguage: 'en',
    languages: {
      en: {
        label: 'English',
        locale: 'en',
        sections: [
          {
            title: 'Eligibility & Account Setup',
            bullets: [
              'Account access is intended for customers who are 18 years or older and submit valid KYC details.',
              'Name, PAN, Aadhaar, address, bank details, and contact information must remain accurate and up to date.',
              'One Capital may approve, hold, or reject any application if verification is incomplete, inconsistent, or raises compliance concerns.',
            ],
          },
          {
            title: 'Trading Services & Risk',
            bullets: [
              'The platform may offer access to equity, derivative, commodity, and other supported market segments.',
              'Leveraged or margin-based trading can magnify both gains and losses, and customers may lose more than their initial deposit.',
              'Market volatility, slippage, liquidity gaps, and technical issues can affect execution, stop-loss behavior, and displayed prices.',
            ],
          },
          {
            title: 'Funds, Charges & Risk Controls',
            bullets: [
              'Brokerage, margin usage, and other applicable charges may be shown in the app, statements, or broker communication.',
              'Customers must maintain sufficient balance or margin. Positions may be reduced or squared off when risk limits are breached.',
              'Deposits, withdrawals, or settlements may be delayed for verification, risk review, system maintenance, or suspected misuse.',
            ],
          },
          {
            title: 'Customer Duties',
            bullets: [
              'Customers are responsible for activity performed using their registered credentials, devices, and approved access methods.',
              'Fraudulent conduct, misleading information, or unauthorized account use can lead to restrictions, suspension, recovery action, or account closure.',
              'Trade confirmations, order history, invoices, and account summaries should be reviewed regularly by the customer.',
            ],
          },
          {
            title: 'Privacy, Support & Updates',
            bullets: [
              'Customer data is handled in line with the Privacy Policy and may be shared when required by law, verification needs, or fraud prevention.',
              'Questions or disputes should first be raised through official support channels.',
              'Continued use of One Capital services after an update means the customer accepts the latest published terms.',
            ],
          },
        ],
      },
      hi: {
        label: 'Hindi',
        locale: 'hi',
        sections: [
          {
            title: 'पात्रता और खाता सत्यापन',
            bullets: [
              'सेवा केवल उन ग्राहकों के लिए है जो 18 वर्ष या उससे अधिक आयु के हैं और वैध KYC विवरण जमा करते हैं।',
              'नाम, PAN, Aadhaar, पता, बैंक विवरण और संपर्क जानकारी सही और अद्यतन रखनी होगी।',
              'यदि सत्यापन अधूरा, असंगत या संदेहास्पद हो तो One Capital आवेदन को रोक, अस्वीकार या अतिरिक्त समीक्षा में रख सकता है।',
            ],
          },
          {
            title: 'ट्रेडिंग सेवाएं और जोखिम',
            bullets: [
              'प्लेटफॉर्म इक्विटी, डेरिवेटिव, कमोडिटी और अन्य समर्थित सेगमेंट तक पहुंच दे सकता है।',
              'लेवरेज या मार्जिन आधारित ट्रेडिंग में लाभ और हानि दोनों बढ़ सकते हैं, और ग्राहक अपनी शुरुआती जमा राशि से अधिक भी खो सकता है।',
              'मार्केट वोलैटिलिटी, स्लिपेज, लिक्विडिटी की कमी और तकनीकी समस्याएं ऑर्डर निष्पादन को प्रभावित कर सकती हैं।',
            ],
          },
          {
            title: 'फंड, शुल्क और रिस्क कंट्रोल',
            bullets: [
              'ब्रोकरेज, मार्जिन उपयोग और अन्य शुल्क ऐप, स्टेटमेंट या ब्रोकर संचार में दिखाए जा सकते हैं।',
              'पर्याप्त बैलेंस या मार्जिन बनाए रखना ग्राहक की जिम्मेदारी है। रिस्क लिमिट टूटने पर पोजीशन घटाई या स्क्वेयर-ऑफ की जा सकती है।',
              'वेरिफिकेशन, रिस्क रिव्यू, सिस्टम मेंटेनेंस या संदिग्ध गतिविधि के कारण जमा, निकासी या सेटलमेंट में देरी हो सकती है।',
            ],
          },
          {
            title: 'ग्राहक की जिम्मेदारियां',
            bullets: [
              'रजिस्टर्ड क्रेडेंशियल, डिवाइस या स्वीकृत एक्सेस से की गई गतिविधि की जिम्मेदारी ग्राहक की होगी।',
              'भ्रामक जानकारी, धोखाधड़ी या अनधिकृत उपयोग के कारण खाता सीमित, निलंबित या बंद किया जा सकता है।',
              'ऑर्डर हिस्ट्री, इनवॉइस और खाता सारांश की नियमित समीक्षा ग्राहक को करनी चाहिए।',
            ],
          },
          {
            title: 'गोपनीयता, सहायता और अपडेट',
            bullets: [
              'ग्राहक डेटा का उपयोग Privacy Policy के अनुसार किया जाएगा और कानून, सत्यापन या फ्रॉड प्रिवेंशन की जरूरत होने पर साझा किया जा सकता है।',
              'किसी भी प्रश्न या विवाद के लिए पहले आधिकारिक सपोर्ट चैनल का उपयोग किया जाना चाहिए।',
              'सेवा का उपयोग जारी रखने का अर्थ है कि ग्राहक नवीनतम अपडेटेड शर्तों को स्वीकार करता है।',
            ],
          },
        ],
      },
    },
  },
  privacy: {
    title: 'Privacy Policy',
    subtitle: 'How customer data is collected, used, and protected',
    icon: 'privacy_tip',
    defaultLanguage: 'en',
    languages: {
      en: {
        label: 'English',
        locale: 'en',
        sections: [
          {
            title: 'Data We Collect',
            bullets: [
              'Identity and KYC information such as name, date of birth, PAN, Aadhaar, address, and uploaded documents.',
              'Contact and account details such as mobile number, email address, broker reference, and bank information.',
              'Operational information such as login activity, IP address, browser or device details, support chats, funding actions, and trading records.',
            ],
          },
          {
            title: 'How We Use Data',
            bullets: [
              'To open and verify accounts, provide platform access, and support deposits, withdrawals, and customer service.',
              'To perform KYC, AML, fraud checks, internal risk reviews, and service monitoring.',
              'To send operational alerts, account updates, support responses, and service-related communication.',
            ],
          },
          {
            title: 'Sharing & Protection',
            bullets: [
              'Data may be shared with broker partners, verification vendors, payment providers, support systems, or authorities when required for lawful business operations.',
              'Access should be limited to authorized teams and approved service providers with a business need.',
              'Reasonable technical and operational safeguards are used, but no system can promise absolute security at all times.',
            ],
          },
          {
            title: 'Customer Choices & Updates',
            bullets: [
              'Customers should keep their profile details current and review notices whenever the privacy policy changes.',
              'Support requests may be used to correct, review, or clarify stored information, subject to legal and business retention requirements.',
              'Continued use of the service after an update means the customer acknowledges the latest published privacy notice.',
            ],
          },
        ],
      },
      hi: {
        label: 'Hindi',
        locale: 'hi',
        sections: [
          {
            title: 'हम कौन सा डेटा लेते हैं',
            bullets: [
              'पहचान और KYC जानकारी जैसे नाम, जन्मतिथि, PAN, Aadhaar, पता और अपलोड किए गए दस्तावेज।',
              'संपर्क और खाता जानकारी जैसे मोबाइल नंबर, ईमेल, ब्रोकर संदर्भ और बैंक विवरण।',
              'ऑपरेशनल जानकारी जैसे लॉगिन गतिविधि, IP address, डिवाइस या ब्राउज़र जानकारी, सपोर्ट चैट, फंडिंग और ट्रेड रिकॉर्ड।',
            ],
          },
          {
            title: 'डेटा का उपयोग कैसे होता है',
            bullets: [
              'खाता खोलने, सत्यापन करने, प्लेटफॉर्म एक्सेस देने और जमा-निकासी प्रक्रिया में सहायता के लिए।',
              'KYC, AML, फ्रॉड जांच, आंतरिक रिस्क रिव्यू और सर्विस मॉनिटरिंग के लिए।',
              'ऑपरेशनल अलर्ट, खाता अपडेट, सपोर्ट जवाब और सर्विस संबंधी संचार भेजने के लिए।',
            ],
          },
          {
            title: 'शेयरिंग और सुरक्षा',
            bullets: [
              'जरूरत पड़ने पर डेटा ब्रोकर पार्टनर, वेरिफिकेशन वेंडर, पेमेंट प्रोवाइडर, सपोर्ट सिस्टम या कानूनी प्राधिकरणों के साथ साझा किया जा सकता है।',
              'डेटा एक्सेस केवल अधिकृत टीमों और स्वीकृत सेवा प्रदाताओं तक सीमित होना चाहिए।',
              'उचित तकनीकी और परिचालन सुरक्षा उपाय अपनाए जाते हैं, लेकिन कोई भी सिस्टम हर समय पूर्ण सुरक्षा की गारंटी नहीं दे सकता।',
            ],
          },
          {
            title: 'ग्राहक विकल्प और अपडेट',
            bullets: [
              'ग्राहक को अपनी प्रोफाइल जानकारी अद्यतन रखनी चाहिए और नीति बदलने पर नोटिस पढ़ना चाहिए।',
              'सपोर्ट अनुरोधों के माध्यम से जानकारी की समीक्षा, सुधार या स्पष्टीकरण किया जा सकता है, बशर्ते कानूनी और व्यावसायिक रिटेंशन नियम लागू हों।',
              'अपडेट के बाद सेवा का उपयोग जारी रखने का अर्थ है कि ग्राहक नवीनतम प्राइवेसी नोटिस को स्वीकार करता है।',
            ],
          },
        ],
      },
    },
  },
};

export default legalDocuments;
