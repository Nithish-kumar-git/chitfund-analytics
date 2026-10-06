import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envContent = fs.readFileSync('.env.local', 'utf-8')
const envs: Record<string, string> = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) {
    envs[match[1]] = match[2].trim()
  }
})

const supabaseUrl = envs['NEXT_PUBLIC_SUPABASE_URL']
const supabaseServiceKey = envs['SUPABASE_SERVICE_ROLE_KEY'] || envs['NEXT_PUBLIC_SUPABASE_ANON_KEY']

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  const { data, error } = await supabase
    .from('auction_events')
    .select('calculation_status')
  
  if (error) {
    console.error('Error fetching:', error)
    process.exit(1)
  }

  const counts: Record<string, number> = {}
  for (const row of data) {
    counts[row.calculation_status] = (counts[row.calculation_status] || 0) + 1
  }

  console.log('--- Row Counts by calculation_status ---')
  console.table(counts)
  console.log(`Total rows: ${data.length}`)
}

run()
