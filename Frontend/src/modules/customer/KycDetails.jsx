import { useEffect, useState } from 'react';
import TopHeader from '../../components/shared/TopHeader';
import customerApi from '../../api/customer';

const KycDetails = () => {
  const [loading, setLoading] = useState(true);
  const [kycData, setKycData] = useState({
    status: 'pending',
    pan: '',
    aadhar: '',
    name: '',
    dob: '',
    address: '',
    verifiedOn: '',
  });

  useEffect(() => {
    const fetchKyc = async () => {
      try {
        const response = await customerApi.getKyc();
        const kyc = response.kyc || response.data?.kyc || response;
        setKycData({
          status: kyc.status || 'pending',
          pan: kyc.panNumber || '',
          aadhar: kyc.aadharNumber || '',
          name: kyc.name || '',
          dob: kyc.dateOfBirth || '',
          address: kyc.address || '',
          verifiedOn: kyc.verifiedAt ? new Date(kyc.verifiedAt).toLocaleDateString('en-IN') : '',
        });
      } catch (err) {
        console.error('Failed to load KYC:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchKyc();
  }, []);

  const isVerified = kycData.status === 'verified';

  return (
    <div className="min-h-screen bg-background-light dark:bg-[#050806]">
      <TopHeader title="KYC Details" showBack={true} />

      <div className="px-4 py-5 space-y-5">
        <div className={`rounded-2xl p-5 ${isVerified ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isVerified ? 'bg-green-100 dark:bg-green-900/40' : 'bg-amber-100 dark:bg-amber-900/40'}`}>
              <span className={`material-symbols-outlined ${isVerified ? 'text-green-600' : 'text-amber-600'}`}>{isVerified ? 'verified_user' : 'pending'}</span>
            </div>
            <div>
              <p className={`font-bold ${isVerified ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>{isVerified ? 'KYC Verified' : 'KYC Pending'}</p>
              <p className="text-sm text-gray-600 dark:text-[#9cb7aa]">
                {kycData.verifiedOn ? `Verified on ${kycData.verifiedOn}` : 'Verification pending'}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-[#111b17] rounded-2xl border border-gray-100 dark:border-[#22352d] overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-[#22352d]">
            <h3 className="font-semibold text-gray-900 dark:text-[#e8f3ee]">Identity Details</h3>
          </div>
          {loading ? (
            <div className="p-4 space-y-3 animate-pulse">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex justify-between items-center">
                  <div className="h-3 bg-gray-200 dark:bg-[#16231d] rounded w-24"></div>
                  <div className="h-3 bg-gray-200 dark:bg-[#16231d] rounded w-40"></div>
                </div>
              ))}
            </div>
          ) : (
            [
              { label: 'Full Name', value: kycData.name || '-' },
              { label: 'PAN Number', value: kycData.pan || '-' },
              { label: 'Aadhar Number', value: kycData.aadhar || '-' },
              { label: 'Date of Birth', value: kycData.dob || '-' },
              { label: 'Address', value: kycData.address || '-' },
            ].map((item, i) => (
              <div key={i} className="flex justify-between items-start p-4 border-b border-gray-100 dark:border-[#22352d] last:border-0">
                <span className="text-gray-500 dark:text-[#9cb7aa] text-sm">{item.label}</span>
                <span className="font-medium text-gray-900 dark:text-[#e8f3ee] text-right max-w-[60%]">{item.value}</span>
              </div>
            ))
          )}
        </div>

        {!isVerified && (
          <button className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg">Complete KYC</button>
        )}
      </div>
    </div>
  );
};

export default KycDetails;
