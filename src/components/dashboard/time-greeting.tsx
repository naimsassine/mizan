"use client"

import { useEffect, useState } from "react"

export function TimeGreeting({ name }: { name: string }) {
  const [greeting, setGreeting] = useState("Welcome back")

  useEffect(() => {
    const hour = new Date().getHours()
    setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening")
  }, [])

  return (
    <h1 className="text-[1.6rem] font-semibold tracking-tight text-zinc-900 leading-tight">
      {greeting},{" "}
      <span className="text-zinc-400">{name}</span>
    </h1>
  )
}
