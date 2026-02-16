export default function CandidatesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Candidates</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-600 text-sm">New</p>
          <p className="text-3xl font-bold text-gray-900">--</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-600 text-sm">Contacted</p>
          <p className="text-3xl font-bold text-gray-900">--</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-gray-600 text-sm">Responded</p>
          <p className="text-3xl font-bold text-gray-900">--</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 text-center text-gray-500">
          <p>No candidates yet.</p>
        </div>
      </div>
    </div>
  )
}
