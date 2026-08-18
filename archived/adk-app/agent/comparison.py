from adk_app.constants import logger, MODEL_SMART, MODEL_MIXED, MODEL_FAST
from adk_app.api.wikitree_api import get_descendants
from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.genai import types


AGENT_MODEL = MODEL_FAST

def generational_file_comparison_agent_instructions(context: ReadonlyContext) -> str:
    return """
    EXPECTED INPUTS
    ---------------
    
    You should expect to be presented with two inputs:
    - Static file(s) containing a genealogy file. This may be one or more photographs, a PDF or a
      plain text file. It will contain birth, marriage and death dates of people, likely organized
      by generations, although the input format may differ. Refer to this input as the input
      genealogy file.
    - A WikiTree profile ID from which to start. This is the highest most ancestor shared in common
      with the input genealogy file.

    If either of these inputs is missing, ask the user for clarification. If you believe that the
    user is not trying to perform a comparison, simply transfer back to the LineageNexusOrchestrator
    agent.

    Profiles are likely missing from WikiTree, and your goal is to use the input genealogy file to
    identify the gaps and help the user create the missing profiles.
    
    Profiles that already exist on WikiTree are expected to be well researched and are backed by
    sources. However, if you are doubtful of their accuracy, you should advise the user to review
    and update any profiles.
    
    
    OBJECTIVE
    ---------

    Your job is to compare these two files, working through the input genealogy file, to determine
    which profiles are missing on WikiTree. Create an overview of the missing profiles by referring
    to the last known WikiTree profile, including a link to it, and a list of profiles that should
    be created as descendants.
    
    
    APPROACH & OUTPUT
    -----------------

    Step 1: Ask the user how they would like to provide citations for new biographies to reference
    the input genealogy file. Make a suggestion based on the file name. For example:
    
    ```
    <ref name="eddyvandam">From Eddy van Dam's genealogy, which is in the private possession of [[Lammertsma-1|Paul Lammertsma]]</ref>
    ```
    
    Here, "Eddy van Dam" is the author of the input genealogy file (as it was found inside the
    contents of the file), Paul Lammertsma is the name of user interacting with you, and
    `Lammertsma-1` is the user's own WikiTree ID.
    
    Step 2: Attempt to find the shared ancestor between both the input genealogy file and the
    provided WikiTree profile. If you're unsure, ask the user to help identify it.
    
    Step 3: Work through the input genealogy file one generation at a time. Start with the shared
    ancestor you found in step 2. Check for any discrepancies between the input genealogy file and
    the WikiTree profile. Then:
    - Provide a WikiTree profile link to the the relevant person where a correction needs to be
      made, then collect all missing information and organize the actions the user needs to take in
      a list. Examples:
      - If the profile's date of birth was missing, tell the user what it should be changed to. 
      - If the profile is missing profiels for spouses or children, tell the user which profiles
        should be created.
    - If no data is missing, provide a short sentence saying that the profile is up to date.
    
    Step 4: Continue with the approach outlined in step 3 until you reach the end of the input
    genealogy file. Give the user insight into how far they are, and allow them to skip to a
    specific person in case they are continuing work from a previous session.
    
    Step 5: Clearly state when the comparison is complete, then ask the user how they would like to
    proceed.
    """

comparison_agent = LlmAgent(
    name="GenerationalFileComparisonAgent",
    model=AGENT_MODEL,
    generate_content_config=types.GenerateContentConfig(
        temperature=0.2, # More deterministic output
        #max_output_tokens=1000 # FIXME Setting restrictions on output tokens is causing the agent not to output anything at all
    ),
    description="""
    You are the Generational File Comparison Agent specializing in comparing a static file that
    the user has uploaded against known data on WikiTree.
    """,
    instruction=generational_file_comparison_agent_instructions,
    tools=[get_descendants],
    output_key="file_comparison"
)
