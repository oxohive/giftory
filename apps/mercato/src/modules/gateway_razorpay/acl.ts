export const features = [
  {
    id: 'gateway_razorpay.view',
    title: 'View Razorpay gateway configuration',
    module: 'gateway_razorpay',
    dependsOn: ['payment_gateways.view'],
  },
  {
    id: 'gateway_razorpay.configure',
    title: 'Configure Razorpay gateway settings',
    module: 'gateway_razorpay',
    dependsOn: ['gateway_razorpay.view', 'payment_gateways.manage'],
  },
]

export default features
