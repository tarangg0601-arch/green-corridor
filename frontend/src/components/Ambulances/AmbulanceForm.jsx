import { useState, useEffect } from 'react';
import { createAmbulance } from '../../api/ambulances';
import { fetchHospitals } from '../../api/hospitals';

const AmbulanceForm = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    vehicleNumber: '',
    driverName: '',
    hospital: ''
  });
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const loadHospitals = async () => {
      try {
        const data = await fetchHospitals();
        setHospitals(data);
        if (data.length > 0 && !formData.hospital) {
          setFormData(prev => ({ ...prev, hospital: data[0].name }));
        }
      } catch (err) {
        console.error('Failed to load hospitals', err);
      }
    };
    loadHospitals();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      await createAmbulance(formData);
      setFormData(prev => ({ vehicleNumber: '', driverName: '', hospital: hospitals[0]?.name || '' }));
      onSuccess();
    } catch (err) {
      console.error('Failed to create ambulance', err);
      const msg = err.response?.data?.error || err.message || 'Error creating ambulance';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow mb-6">
      <h2 className="text-lg font-bold mb-4">Register New Ambulance</h2>
      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {errorMsg}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Number</label>
          <input
            required
            type="text"
            placeholder="e.g. TN-01-AB-1234"
            className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-gc-green"
            value={formData.vehicleNumber}
            onChange={(e) => setFormData({...formData, vehicleNumber: e.target.value})}
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Driver Name</label>
          <input
            required
            type="text"
            className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-gc-green"
            value={formData.driverName}
            onChange={(e) => setFormData({...formData, driverName: e.target.value})}
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-1">Hospital Base</label>
          <select
            required
            className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-gc-green bg-white"
            value={formData.hospital}
            onChange={(e) => setFormData({...formData, hospital: e.target.value})}
          >
            {hospitals.length === 0 ? (
              <option value="">Loading hospitals...</option>
            ) : (
              hospitals.map(h => (
                <option key={h.id} value={h.name}>{h.name}</option>
              ))
            )}
          </select>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-gc-green hover:bg-emerald-600 text-white font-medium py-2 px-6 rounded transition-colors disabled:opacity-50"
        >
          {loading ? 'Adding...' : 'Add'}
        </button>
      </form>
    </div>
  );
};

export default AmbulanceForm;
