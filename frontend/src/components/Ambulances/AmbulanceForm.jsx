import { useState } from 'react';
import { createAmbulance } from '../../api/ambulances';

const AmbulanceForm = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    vehicleNumber: '',
    driverName: '',
    hospital: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createAmbulance(formData);
      setFormData({ vehicleNumber: '', driverName: '', hospital: '' });
      onSuccess();
    } catch (err) {
      console.error('Failed to create ambulance', err);
      alert('Error creating ambulance');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow mb-6">
      <h2 className="text-lg font-bold mb-4">Register New Ambulance</h2>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Hospital</label>
          <input
            required
            type="text"
            className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-gc-green"
            value={formData.hospital}
            onChange={(e) => setFormData({...formData, hospital: e.target.value})}
          />
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
