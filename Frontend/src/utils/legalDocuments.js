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
            title: 'Draft Notice',
            paragraphs: [
              'This is the current working draft of the One Capital Terms & Conditions.',
              'The final legal version may be expanded, refined, or translated further before release. Customers should review the latest published copy before opening or operating an account.',
            ],
          },
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
            title: 'ड्राफ्ट सूचना',
            paragraphs: [
              'यह One Capital के Terms & Conditions का वर्तमान ड्राफ्ट संस्करण है।',
              'अंतिम कानूनी कॉपी जारी होने से पहले इसमें बदलाव, विस्तार या अतिरिक्त भाषा अपडेट किए जा सकते हैं।',
            ],
          },
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
      gu: {
        label: 'Gujarati',
        locale: 'gu',
        sections: [
          {
            title: 'ડ્રાફ્ટ સૂચના',
            paragraphs: [
              'આ One Capital ના Terms & Conditions નો હાલનો ડ્રાફ્ટ વર્ઝન છે.',
              'અંતિમ કાનૂની નકલ જાહેર થાય તે પહેલાં તેમાં ફેરફાર, વધારાની કલમો અથવા વધુ સચોટ ભાષાંતર ઉમેરાઈ શકે છે.',
            ],
          },
          {
            title: 'પાત્રતા અને ખાતા ચકાસણી',
            bullets: [
              'સેવા માત્ર 18 વર્ષ અથવા તેથી વધુ ઉંમરના અને માન્ય KYC વિગતો આપતા ગ્રાહકો માટે છે.',
              'નામ, PAN, Aadhaar, સરનામું, બેંક વિગતો અને સંપર્ક માહિતી સાચી અને અપડેટ હોવી જરૂરી છે.',
              'ચકાસણી અધૂરી, અસંગત અથવા શંકાસ્પદ હોય તો One Capital અરજીને રોકી, નામંજૂર કરી અથવા વધારાની સમીક્ષા માટે રાખી શકે છે.',
            ],
          },
          {
            title: 'ટ્રેડિંગ સેવાઓ અને જોખમ',
            bullets: [
              'પ્લેટફોર્મ ઇક્વિટી, ડેરિવેટિવ, કોમોડિટી અને અન્ય સપોર્ટેડ સેગમેન્ટમાં ઍક્સેસ આપી શકે છે.',
              'લેવરેજ અથવા માર્જિન આધારિત ટ્રેડિંગમાં નફો અને નુકસાન બંને વધી શકે છે, અને ગ્રાહક પોતાની પ્રારંભિક જમા રકમ કરતાં વધુ નુકસાન પણ કરી શકે છે.',
              'માર્કેટ વોલેટિલિટી, સ્લિપેજ, લિક્વિડિટી ગેપ અને ટેક્નિકલ સમસ્યાઓ ઓર્ડર એક્ઝિક્યુશનને અસર કરી શકે છે.',
            ],
          },
          {
            title: 'ફંડ, ચાર્જ અને રિસ્ક કંટ્રોલ',
            bullets: [
              'બ્રોકરેજ, માર્જિન ઉપયોગ અને અન્ય લાગુ ચાર્જ એપ, સ્ટેટમેન્ટ અથવા બ્રોકર કમ્યુનિકેશનમાં બતાવવામાં આવી શકે છે.',
              'પૂરતો બેલેન્સ અથવા માર્જિન જાળવવો ગ્રાહકની જવાબદારી છે. રિસ્ક લિમિટ તૂટે તો પોઝિશન ઘટાડવામાં અથવા સ્ક્વેર-ઓફ કરવામાં આવી શકે છે.',
              'વેરિફિકેશન, રિસ્ક રિવ્યૂ, સિસ્ટમ મેન્ટેનન્સ અથવા શંકાસ્પદ પ્રવૃત્તિના કારણે જમા, ઉપાડ અથવા સેટલમેન્ટમાં વિલંબ થઈ શકે છે.',
            ],
          },
          {
            title: 'ગ્રાહકની જવાબદારીઓ',
            bullets: [
              'રજિસ્ટર્ડ ક્રેડેન્શિયલ, ડિવાઇસ અથવા મંજૂર ઍક્સેસ દ્વારા થયેલી પ્રવૃત્તિ માટે ગ્રાહક જવાબદાર રહેશે.',
              'ખોટી માહિતી, છેતરપિંડી અથવા અનધિકૃત ઉપયોગના કારણે ખાતા પર મર્યાદા, સસ્પેન્શન અથવા બંધ કરવાની કાર્યવાહી થઈ શકે છે.',
              'ઓર્ડર હિસ્ટરી, ઇનવૉઇસ અને ખાતાનું સારાંશ નિયમિત રીતે તપાસવું ગ્રાહક માટે જરૂરી છે.',
            ],
          },
          {
            title: 'ગોપનીયતા, સહાય અને અપડેટ',
            bullets: [
              'ગ્રાહક ડેટાનો ઉપયોગ Privacy Policy મુજબ કરવામાં આવશે અને કાયદાકીય, વેરિફિકેશન અથવા ફ્રોડ પ્રિવેન્શન જરૂરીયાતમાં શેર થઈ શકે છે.',
              'કોઈ પ્રશ્ન અથવા વિવાદ માટે પહેલા સત્તાવાર સપોર્ટ ચેનલનો ઉપયોગ કરવો જોઈએ.',
              'સેવાનો સતત ઉપયોગ કરવાનો અર્થ છે કે ગ્રાહક નવીનતમ અપડેટેડ શરતો સ્વીકારે છે.',
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
            title: 'Draft Notice',
            paragraphs: [
              'This privacy draft summarizes how customer data may be collected, used, stored, and reviewed while the final legal text is being prepared.',
            ],
          },
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
            title: 'ड्राफ्ट सूचना',
            paragraphs: [
              'यह ड्राफ्ट बताता है कि ग्राहक डेटा कैसे एकत्र, उपयोग, संग्रहित और समीक्षा किया जा सकता है, जबकि अंतिम कानूनी टेक्स्ट तैयार किया जा रहा है।',
            ],
          },
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
      gu: {
        label: 'Gujarati',
        locale: 'gu',
        sections: [
          {
            title: 'ડ્રાફ્ટ સૂચના',
            paragraphs: [
              'આ ડ્રાફ્ટ સમજાવે છે કે ગ્રાહક ડેટા કેવી રીતે એકત્રિત, ઉપયોગ, સંગ્રહિત અને સમીક્ષા થઈ શકે છે જ્યારે અંતિમ કાનૂની ટેક્સ્ટ તૈયાર થઈ રહ્યો છે.',
            ],
          },
          {
            title: 'અમે કયો ડેટા એકત્ર કરીએ છીએ',
            bullets: [
              'ઓળખ અને KYC માહિતી જેમ કે નામ, જન્મ તારીખ, PAN, Aadhaar, સરનામું અને અપલોડ કરેલા દસ્તાવેજો.',
              'સંપર્ક અને ખાતાની માહિતી જેમ કે મોબાઇલ નંબર, ઇમેલ, બ્રોકર રેફરન્સ અને બેંક વિગતો.',
              'ઓપરેશનલ માહિતી જેમ કે લોગિન પ્રવૃત્તિ, IP address, ડિવાઇસ અથવા બ્રાઉઝર વિગતો, સપોર્ટ ચેટ, ફંડિંગ અને ટ્રેડિંગ રેકોર્ડ.',
            ],
          },
          {
            title: 'ડેટાનો ઉપયોગ કેવી રીતે થાય છે',
            bullets: [
              'એકાઉન્ટ ખોલવા, ચકાસવા, પ્લેટફોર્મ ઍક્સેસ આપવા અને જમા-ઉપાડ પ્રક્રિયાને સપોર્ટ કરવા માટે.',
              'KYC, AML, ફ્રોડ ચેક, આંતરિક રિસ્ક રિવ્યૂ અને સર્વિસ મોનિટરિંગ માટે.',
              'ઓપરેશનલ અલર્ટ, એકાઉન્ટ અપડેટ, સપોર્ટ પ્રતિસાદ અને સર્વિસ સંબંધિત કમ્યુનિકેશન મોકલવા માટે.',
            ],
          },
          {
            title: 'શેરિંગ અને સુરક્ષા',
            bullets: [
              'કાનૂની અથવા વ્યવસાયિક જરૂરિયાત મુજબ ડેટા બ્રોકર પાર્ટનર, વેરિફિકેશન વેન્ડર, પેમેન્ટ પ્રોવાઇડર, સપોર્ટ સિસ્ટમ અથવા સત્તાવાર સંસ્થાઓ સાથે શેર થઈ શકે છે.',
              'ડેટાની ઍક્સેસ માત્ર અધિકૃત ટીમો અને મંજૂર સર્વિસ પ્રોવાઇડર્સ સુધી મર્યાદિત હોવી જોઈએ.',
              'યોગ્ય ટેક્નિકલ અને ઓપરેશનલ સુરક્ષા પગલાં લેવાય છે, છતાં કોઈપણ સિસ્ટમ સંપૂર્ણ સુરક્ષાની ખાતરી હંમેશા આપી શકતી નથી.',
            ],
          },
          {
            title: 'ગ્રાહક વિકલ્પો અને અપડેટ',
            bullets: [
              'ગ્રાહકે પોતાની પ્રોફાઇલ માહિતી અપડેટ રાખવી જોઈએ અને નીતિ બદલાય ત્યારે નોટિસ વાંચવી જોઈએ.',
              'સપોર્ટ વિનંતિ દ્વારા સંગ્રહિત માહિતીની સમીક્ષા, સુધારો અથવા સ્પષ્ટતા કરી શકાય છે, જો કાનૂની અને વ્યાવસાયિક રિટેન્શન નિયમો લાગુ પડતા હોય.',
              'અપડેટ પછી સેવાઓનો સતત ઉપયોગ કરવાનો અર્થ છે કે ગ્રાહક નવીનતમ પ્રાઇવસી નોટિસ સ્વીકારી રહ્યો છે.',
            ],
          },
        ],
      },
    },
  },
};

export default legalDocuments;
