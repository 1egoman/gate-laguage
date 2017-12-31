package main

import (
  "fmt"
  "encoding/json"
  "flag"
  "net/http"
  "bytes"

  // For reading file from disk
  "io/ioutil"
)

type Summary struct {
  Gates []*Gate
  Wires []*Wire
  Outputs []*Wire
}

func act(input string, tokenize bool, verbose bool) (*Summary, error) {
  result, err := Tokenizer(input)
  if err != nil {
    return nil, err
  }

  if tokenize {
    PrintAst(result, 0, "")
    return nil, nil
  }

  if verbose {
    fmt.Println("RESULTS FROM TOKENIZER:")
    PrintAst(result, 0, "")
    fmt.Println()
    fmt.Println()
    fmt.Println()
  }

  stack := []*StackFrame{ &StackFrame{} }

  if result == nil {
    fmt.Println("Result was nil!")
    return nil, nil
  }

  var allGates []*Gate
  var allWires []*Wire
  var finalOutputs []*Wire

  resultValues := *result

  for len(resultValues) > 0 {
    if verbose { fmt.Println("==========>", resultValues) }
    gates, wires, outputs, err := Parse(&resultValues, stack)

    allGates = append(allGates, gates...)
    allWires = append(allWires, wires...)
    finalOutputs = outputs

    if err != nil {
      return nil, err
    }

    if verbose {
      fmt.Println("GATES:")
      for _, gate := range gates {
        fmt.Printf("- %s ", gate.Type)

        fmt.Printf("(IN:")
        for _, input := range gate.Inputs {
          fmt.Printf(" %+v", input)
        }
        fmt.Printf(") ")

        fmt.Printf("(OUT:")
        for _, output := range gate.Outputs {
          fmt.Printf(" %+v", output)
        }
        fmt.Printf(")")

        fmt.Printf(` frame=%d`, gate.CallingContext)
        fmt.Printf(` label="%s"`, gate.Label)
        fmt.Printf("\n")
      }
      fmt.Println("===")

      fmt.Println("WIRES:")
      for _, wire := range wires {
        fmt.Printf("- %+v\n", wire)
      }
      fmt.Println("===")

      fmt.Println("OUTPUTS:")
      for _, output := range outputs {
        fmt.Printf("- %+v\n", output)
      }
      fmt.Println("===")
    }
  }

  if verbose {
    fmt.Println("FINAL OUTPUTS", finalOutputs)
  }

  // Print out a summary of the results to that they can be rendered.
  summary := Summary{
    Gates: allGates,
    Wires: allWires,
    Outputs: finalOutputs,
  }

  return &summary, nil
}

func main() {
  var tokenize = flag.Bool("tokenize", false, "Only tokenize the input, don't actually convert to gates.")
  var verbose = flag.Bool("verbose", false, "Print lots of debugging output.")
  var server = flag.Bool("server", false, "Run as a http server")
  flag.Parse()

  args := flag.Args()

  if *server {
    http.HandleFunc("/v1", func(w http.ResponseWriter, r *http.Request) {
      //Allow CORS here By * or specific origin
      w.Header().Set("Access-Control-Allow-Origin", "*")

      w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

      buf := new(bytes.Buffer)
      buf.ReadFrom(r.Body)
      source := buf.String() // Does a complete copy of the bytes in the buffer.

      wireId = 0
      gateId = 0
      stackFrameId = 0
      summary, err := act(source, *tokenize, *verbose)
      if err != nil {
        json.NewEncoder(w).Encode(map[string]string{"Error": err.Error()})
      } else {
        json.NewEncoder(w).Encode(summary)
      }
    })

    fmt.Println("Starting server on :8080")
    err := http.ListenAndServe(":8080", nil)
    panic(err)
  }

  if len(args) == 0 {
    fmt.Println("Please pass a file path to act on!")
    return
  }

  // Read source code from disk
  source, err := ioutil.ReadFile(args[0])
  if err != nil {
    panic(err)
  }


  summary, err1 := act(string(source), *tokenize, *verbose)
  if err1 != nil {
    fmt.Println(err1)
    return
  }

  serialized, err2 := json.Marshal(summary)
  if err2 != nil {
    fmt.Println(err2)
    return
  }
  fmt.Println(string(serialized))
}

