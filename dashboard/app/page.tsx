export default function Home() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to Hood Hero Recruiter</h2>
        <p className="text-gray-600 mb-4">
          Automated LinkedIn recruiting with human approval workflow.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900">Campaigns</h3>
            <p className="text-2xl font-bold text-blue-600 mt-2">--</p>
            <p className="text-sm text-blue-700">Total campaigns</p>
          </div>
          
          <div className="bg-green-50 rounded-lg p-4">
            <h3 className="font-semibold text-green-900">Candidates</h3>
            <p className="text-2xl font-bold text-green-600 mt-2">--</p>
            <p className="text-sm text-green-700">Total contacted</p>
          </div>
          
          <div className="bg-purple-50 rounded-lg p-4">
            <h3 className="font-semibold text-purple-900">Responses</h3>
            <p className="text-2xl font-bold text-purple-600 mt-2">--</p>
            <p className="text-sm text-purple-700">Response rate</p>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-900">⚠️ Setup Required</h3>
        <p className="text-yellow-800 mt-2">
          Update environment variables in Railway to connect the dashboard to your database.
        </p>
      </div>
    </div>
  )
}
